import "server-only";
import fs from "node:fs";

/**
 * Print an HTML string to an A4 PDF with headless Chromium. On Vercel/Lambda the
 * browser binary comes from @sparticuz/chromium; locally it's whatever Chrome
 * the machine already has (env override or a few well-known paths). Kept behind
 * a try/catch caller so a launch failure falls back to the @react-pdf renderer.
 */

const LOCAL_CHROME_CANDIDATES = [
  process.env.CHROME_EXECUTABLE_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

function localChrome(): string | undefined {
  for (const p of LOCAL_CHROME_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  // Fall back to a Playwright/Puppeteer cache if one is present (dev machines).
  const globs = [
    `${process.env.HOME}/.cache/ms-playwright`,
    `${process.env.HOME}/.cache/puppeteer`,
  ];
  for (const root of globs) {
    try {
      const hit = findExecutable(root);
      if (hit) return hit;
    } catch {}
  }
  return undefined;
}

function findExecutable(dir: string, depth = 0): string | undefined {
  if (depth > 6) return undefined;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      const hit = findExecutable(full, depth + 1);
      if (hit) return hit;
    } else if (
      entry.name === "chrome" ||
      entry.name === "chrome-headless-shell" ||
      entry.name === "headless_shell"
    ) {
      return full;
    }
  }
  return undefined;
}

const onServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV,
);

export type PdfDocOptions = {
  /** Shown bottom-left on every page, e.g. "INV-2026-003 · Litch Consulting". */
  footerLabel?: string;
};

/** Escape for the header/footer templates (they're raw HTML fragments). */
const escHtml = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function renderHtmlPdf(html: string, opts: PdfDocOptions = {}): Promise<Buffer> {
  const puppeteer = await import("puppeteer-core");

  let launchOpts: Parameters<typeof puppeteer.launch>[0];
  if (onServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    launchOpts = {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    };
  } else {
    const executablePath = localChrome();
    if (!executablePath) throw new Error("No local Chrome found for HTML→PDF");
    launchOpts = { args: ["--no-sandbox", "--disable-gpu"], executablePath, headless: true };
  }

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    // Everything (fonts, signature, QR) is embedded as data URIs, so there is
    // no network to idle on — "load" fires once the inline assets are parsed.
    await page.setContent(html, { waitUntil: "load", timeout: 20_000 });

    // A long line-item list runs to several A4 pages, so every page carries the
    // document's identity and "Page x of y" — a loose sheet is still traceable.
    // Chromium renders these templates inside the page margin, hence the bottom
    // margin below (the body reserves no space for them itself).
    const label = escHtml(opts.footerLabel ?? "");
    const footerTemplate = `
      <div style="width:100%;padding:0 44px;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:7.5px;color:#8a92a6;display:flex;justify-content:space-between;align-items:center;">
        <span>${label}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`;

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>", // no running header; page 1 carries the masthead
      footerTemplate,
      margin: { top: "0", right: "0", bottom: "38px", left: "0" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
