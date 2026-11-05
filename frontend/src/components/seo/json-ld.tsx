/**
 * Renders schema.org JSON-LD. `<` is escaped so text in the data (titles,
 * FAQ answers, CMS posts) can never close the script tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown> | null> | null }) {
  const items = (Array.isArray(data) ? data : [data]).filter(Boolean);
  if (!items.length) return null;
  const json = JSON.stringify(items.length === 1 ? items[0] : items).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
