/** Splitting the Markdown sources into pages and resolving links between them. */

export interface Heading {
  level: number;
  text: string;
  /** GitHub-style anchor of the heading in its source file. */
  slug: string;
  line: number;
}

/** Anchor the way GitHub generates it for headings (used by links inside the Markdown files). */
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Headings of a Markdown file, ignoring `#` lines inside code fences. */
export function headingsOf(md: string): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  md.split('\n').forEach((line, i) => {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: (m[1] as string).length, text: m[2] as string, slug: githubSlug(m[2] as string), line: i });
  });
  return out;
}

/**
 * The body of the section under `heading` (excluding the heading line) up to the next heading of
 * the same or a higher level. Without heading: everything below the first H1. Sub-headings are
 * shifted so the page's own sub-sections start at level 2.
 */
export function extractSection(md: string, heading?: string): { body: string; startLine: number } {
  const lines = md.split('\n');
  const hs = headingsOf(md);
  let start: number;
  let end = lines.length;
  let shift = 0;
  if (heading === undefined) {
    const h1 = hs.find((h) => h.level === 1);
    start = h1 ? h1.line + 1 : 0;
  } else {
    const idx = hs.findIndex((h) => h.text === heading);
    if (idx < 0) throw new Error(`Überschrift „${heading}“ nicht gefunden`);
    const h = hs[idx] as Heading;
    start = h.line + 1;
    const next = hs.slice(idx + 1).find((x) => x.level <= h.level);
    if (next) end = next.line;
    shift = h.level - 1;
  }
  const out: string[] = [];
  let fence = false;
  for (const line of lines.slice(start, end)) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && /^(#{2,6})(\s.*)$/.exec(line);
    out.push(m ? `${'#'.repeat(Math.max(2, (m[1] as string).length - shift))}${m[2]}` : line);
  }
  // drop a trailing horizontal rule used as separator in the sources
  return { body: out.join('\n').replace(/\n-{3,}\s*$/, '\n').trim(), startLine: start };
}
