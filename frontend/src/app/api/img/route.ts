import type { NextRequest } from "next/server";

/**
 * Same-origin image proxy for WebGL textures. The public R2 dev URL
 * (*.r2.dev) does not send an `Access-Control-Allow-Origin` header, so
 * cross-origin `<img crossorigin="anonymous">` loads used by the WebGL
 * galleries taint the canvas and render black. Routing those images through
 * this same-origin endpoint (which re-emits ACAO) fixes them without needing
 * to configure CORS on the bucket. Normal `next/image` usages don't need this.
 */
const ALLOWED_HOSTS = new Set([
  "pub-f833c8f2eac548fea544f812455f9ba3.r2.dev",
  "images.unsplash.com",
]);

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src");
  if (!src) return new Response("Missing src", { status: 400 });

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return new Response("Invalid src", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return new Response("Forbidden host", { status: 403 });
  }

  const upstream = await fetch(url.toString(), { cache: "force-cache" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(upstream.body, { status: 200, headers });
}
