/**
 * The operation reference: one Markdown file per operation in docs/reference/<category>/<op>.md,
 * one file per category in docs/reference/<category>.md and shared parameters in
 * docs/reference/_parameter.md. This module only parses; reading files happens in the build.
 *
 * Operation page:
 *
 *   ---
 *   summary: One sentence for the category table and search.
 *   aliases: arrow            (optional: further verbs documented on this page)
 *   ---
 *   # rect
 *   Description and examples …
 *   ## Parameter
 *   <!-- gemeinsam: fill stroke opacity -->      (shared parameters to include)
 *   ### x
 *   - Typ: Länge
 *   - Standard: `0`
 *   - erforderlich | positional
 *   - Werte: `a`, `b`
 *   Description and examples …
 *   ## Beispiele
 *   …
 */

export interface ParamDoc {
  /** Keys documented together (`radius.tl, radius.tr`); the first one names the anchor. */
  keys: string[];
  id: string;
  types: string[];
  default?: string;
  required: boolean;
  positional: boolean;
  values: string[];
  /** Markdown description. */
  body: string;
  shared: boolean;
}

export interface Section {
  title: string;
  body: string;
}

export interface OpDoc {
  verb: string;
  aliases: string[];
  summary: string;
  category: string;
  /** Path below docs/ ("reference/erzeugen/rect.md"). */
  file: string;
  /** Markdown before the first H2. */
  intro: string;
  /** H2 sections in source order; the one titled "Parameter" carries `params`. */
  sections: Section[];
  params: ParamDoc[];
}

export interface CategoryDoc {
  slug: string;
  title: string;
  summary: string;
  /** Verbs in table order (may list operations documented in another category). */
  ops: string[];
  file: string;
  intro: string;
  sections: Section[];
}

export const PARAMETER_SECTION = 'Parameter';

export function parseFrontmatter(md: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (!m) return { meta: {}, body: md };
  const meta: Record<string, string> = {};
  for (const line of (m[1] as string).split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1] as string] = (kv[2] as string).trim();
  }
  return { meta, body: md.slice(m[0].length) };
}

/** Split Markdown at headings of one level (outside code fences). */
export function splitAt(md: string, level: number): { title: string | null; body: string }[] {
  const out: { title: string | null; body: string }[] = [{ title: null, body: '' }];
  let fence = false;
  const marker = `${'#'.repeat(level)} `;
  for (const line of md.split('\n')) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    if (!fence && line.startsWith(marker)) out.push({ title: line.slice(marker.length).trim(), body: '' });
    else (out[out.length - 1] as { body: string }).body += `${line}\n`;
  }
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}

function cleanKey(s: string): string {
  return s.replace(/`/g, '').trim();
}

export function paramId(key: string): string {
  return `param-${key.replace(/^@/, '').replace(/[^\w.-]/g, '')}`;
}

/** One `### key` block of a Parameter section. */
export function parseParam(title: string, body: string, shared = false): ParamDoc {
  const keys = title.split(',').map(cleanKey).filter(Boolean);
  const lines = body.split('\n');
  let i = 0;
  const p: ParamDoc = { keys, id: paramId(keys[0] ?? title), types: [], required: false, positional: false, values: [], body: '', shared };
  for (; i < lines.length; i++) {
    const m = /^-\s+(.*)$/.exec(lines[i] as string);
    if (!m) break;
    const item = (m[1] as string).trim();
    const kv = /^(Typ|Standard|Werte):\s*(.*)$/.exec(item);
    if (kv) {
      const v = kv[2] as string;
      if (kv[1] === 'Typ') p.types = v.split('|').map((t) => t.trim()).filter(Boolean);
      else if (kv[1] === 'Standard') p.default = v;
      else p.values = v.split(',').map(cleanKey).filter(Boolean);
    } else if (/^erforderlich$/i.test(item)) p.required = true;
    else if (/^positional$/i.test(item)) p.positional = true;
    else break;
  }
  p.body = lines.slice(i).join('\n').trim();
  return p;
}

const SHARED_RE = /<!--\s*gemeinsam:\s*([^>]*?)\s*-->/g;

function parseParams(md: string, shared: Map<string, ParamDoc>): ParamDoc[] {
  const parts = splitAt(md, 3);
  const own = parts.filter((p) => p.title !== null).map((p) => parseParam(p.title as string, p.body));
  const ownKeys = new Set(own.flatMap((p) => p.keys));
  const included: ParamDoc[] = [];
  for (const m of md.matchAll(SHARED_RE)) {
    for (const key of (m[1] as string).split(/[\s,]+/).filter(Boolean)) {
      const s = shared.get(key);
      if (!s) throw new Error(`Gemeinsamer Parameter „${key}“ ist nicht in _parameter.md beschrieben`);
      if (!s.keys.some((k) => ownKeys.has(k)) && !included.includes(s)) included.push(s);
    }
  }
  return [...own, ...included];
}

/** Relative Markdown links of a file below docs/ made absolute (`/reference/x.md`), so they stay valid when the text is shown elsewhere. */
export function absoluteLinks(md: string, dir: string): string {
  return md.replace(/\]\((?!https?:|mailto:|#|\/)([^)\s]+)\)/g, (_m, href: string) => {
    const parts = `${dir}/${href}`.split('/');
    const out: string[] = [];
    for (const p of parts) {
      if (p === '..') out.pop();
      else if (p && p !== '.') out.push(p);
    }
    return `](/${out.join('/')})`;
  });
}

export function parseShared(md: string, dir = 'reference'): Map<string, ParamDoc> {
  const map = new Map<string, ParamDoc>();
  for (const part of splitAt(absoluteLinks(parseFrontmatter(md).body, dir), 3)) {
    if (part.title === null) continue;
    const p = parseParam(part.title, part.body, true);
    for (const k of p.keys) map.set(k, p);
  }
  return map;
}

function bodyOf(md: string): { title: string; intro: string; sections: Section[]; rawParams: string | null } {
  const top = splitAt(md, 1);
  const titled = top.find((t) => t.title !== null);
  const content = titled ? titled.body : (top[0]?.body ?? '');
  const parts = splitAt(content, 2);
  const intro = parts[0]?.body ?? '';
  const sections = parts.filter((p) => p.title !== null).map((p) => ({ title: p.title as string, body: p.body }));
  const params = sections.find((s) => s.title === PARAMETER_SECTION);
  return { title: titled?.title ?? '', intro, sections, rawParams: params ? params.body : null };
}

export function parseOp(md: string, file: string, category: string, shared: Map<string, ParamDoc>): OpDoc {
  const { meta, body } = parseFrontmatter(md);
  const b = bodyOf(body);
  const verb = cleanKey(b.title) || (file.split('/').pop() ?? '').replace(/\.md$/, '');
  return {
    verb,
    aliases: (meta.aliases ?? '').split(/[\s,]+/).filter(Boolean),
    summary: meta.summary ?? '',
    category,
    file,
    intro: b.intro,
    sections: b.sections,
    params: b.rawParams === null ? [] : parseParams(b.rawParams, shared),
  };
}

export function parseCategory(md: string, file: string, slug: string): CategoryDoc {
  const { meta, body } = parseFrontmatter(md);
  const b = bodyOf(body);
  return {
    slug,
    title: b.title || slug,
    summary: meta.summary ?? '',
    ops: (meta.ops ?? '').split(/[\s,]+/).filter(Boolean),
    file,
    intro: b.intro,
    sections: b.sections,
  };
}

/** `shadow.x, shadow.y, …` -> `shadow.*` */
export function groupLabel(keys: string[]): string {
  const first = keys[0] as string;
  const prefix = first.includes('.') ? first.slice(0, first.indexOf('.') + 1) : '';
  return keys.length > 1 && prefix && keys.every((k) => k.startsWith(prefix)) ? `${prefix}*` : first;
}

/** Compact signature parts for the "Parameter" header: `rect @id x=Länge …`. */
export function signatureOf(op: OpDoc): { label: string; id: string; positional: boolean; type: string }[] {
  return op.params.map((p) => ({
    label: groupLabel(p.keys),
    id: p.id,
    positional: p.positional,
    type: p.values.length ? p.values.join('|') : (p.types[0] ?? ''),
  }));
}
