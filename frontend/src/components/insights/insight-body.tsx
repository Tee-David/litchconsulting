import { Fragment, type ReactNode } from "react";
import DOMPurify from "isomorphic-dompurify";

/** True once a block carries real HTML tags (tiptap output) rather than the
 *  lightweight markdown the curated + legacy posts use. */
function looksLikeHtml(s: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|img|a|strong|em|blockquote|br|figure)\b/i.test(s);
}

/** Inline **bold** support. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) => {
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={i}>{chunk}</Fragment>;
  });
}

/**
 * Renders an article body from paragraph blocks with a tiny markdown subset:
 * `# ` / `## ` headings, `- ` bullet lists, `**bold**`, otherwise paragraphs.
 * Shared by the CMS editor preview and the public /insights page.
 */
export function InsightBody({ paragraphs, className }: { paragraphs: string[]; className?: string }) {
  // A WYSIWYG (tiptap) post arrives as a single HTML block — render it sanitized
  // with the shared article styles. Curated + legacy posts keep the markdown path.
  const joined = paragraphs.join("\n\n");
  if (looksLikeHtml(joined)) {
    return (
      <div
        className={`article-html ${className ?? ""}`}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(joined) }}
      />
    );
  }
  return (
    <div className={className}>
      {paragraphs.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const isList = lines.length > 0 && lines.every((l) => l.trim().startsWith("- "));

        if (isList) {
          return (
            <ul key={i} className="mt-6 space-y-2 pl-5">
              {lines.map((l, j) => (
                <li key={j} className="list-disc text-base leading-relaxed text-body marker:text-brand">
                  {inline(l.trim().slice(2))}
                </li>
              ))}
            </ul>
          );
        }
        if (block.startsWith("## ")) {
          return (
            <h3 key={i} className="mt-10 font-display text-xl font-bold text-ink">
              {inline(block.slice(3))}
            </h3>
          );
        }
        if (block.startsWith("# ")) {
          return (
            <h2 key={i} className="mt-10 font-display text-2xl font-bold text-ink">
              {inline(block.slice(2))}
            </h2>
          );
        }
        return (
          <p key={i} className="mt-6 text-base leading-relaxed text-body">
            {inline(block)}
          </p>
        );
      })}
    </div>
  );
}
