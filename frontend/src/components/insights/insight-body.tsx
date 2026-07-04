import { Fragment, type ReactNode } from "react";

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
