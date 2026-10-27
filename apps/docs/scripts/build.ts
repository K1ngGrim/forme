import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { highlightSource, imageSize, KEYS_BY_VERB, parse } from '@forme/core';
import type { ImageSize } from '@forme/core';
import { createFontMeasurer } from '@forme/render';
import type { LoadedFont } from '@forme/render';
import { build as esbuild } from 'esbuild';
import { Marked } from 'marked';
import type { Tokens } from 'marked';
import { assetResolver, isFormeCode, prepareExample, renderExample, showsError } from '../src/examples.js';
import type { ExampleContext } from '../src/examples.js';
import { esc, hrefOf, pageHtml, rootOf } from '../src/layout.js';
import type { SitePage, TocEntry } from '../src/layout.js';
import { extractSection, githubSlug, headingsOf } from '../src/markdown.js';
import { groupLabel, PARAMETER_SECTION, parseCategory, parseOp, parseShared, signatureOf } from '../src/reference.js';
import type { CategoryDoc, OpDoc, ParamDoc, Section } from '../src/reference.js';
import { PAGES, REFERENCE_CATEGORIES, REFERENCE_SLUG, REPO_URL } from '../src/site.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '..');
const repo = resolve(app, '../..');
const docsDir = join(repo, 'docs');

export const FONT_FILES = [
  { file: 'inter-latin-400-normal.woff', weight: 400, italic: false },
  { file: 'inter-latin-700-normal.woff', weight: 700, italic: false },
  { file: 'inter-latin-400-italic.woff', weight: 400, italic: true },
  { file: 'inter-latin-700-italic.woff', weight: 700, italic: true },
];
const FONT_SRC = join(repo, 'examples/hka-seminar/fonts');
const IMAGES = [join(repo, 'examples/img/umsatz.svg')];
const GUIDE_THEME = join(repo, 'examples/guide/themes/mein-theme.forme');

export interface BuildReport {
  pages: number;
  examples: number;
  rendered: number;
  /** Forme blocks shown as code only (theme snippets, fragments). */
  codeOnly: number;
  failed: { page: string; code: string; errors: string[] }[];
  /** Warnings (e.g. unknown keys) in examples of the operation reference: the docs would be wrong. */
  warned: { page: string; code: string; warnings: string[] }[];
  searchEntries: number;
  /** Operations documented in the reference (verbs and aliases). */
  documented: Map<string, OpDoc>;
}

interface SearchEntry {
  /** Page path relative to the docs root, with optional #anchor. */
  url: string;
  page: string;
  heading: string;
  text: string;
  /** Terms this entry defines (operation names, parameter keys, table terms): ranked first. */
  keys: string[];
}

interface Built extends SitePage {
  /** Source file below docs/. */
  file: string;
  heading?: string;
  op?: OpDoc;
  category?: CategoryDoc;
}

function plain(md: string): string {
  return md
    .replace(/^```[\w-]*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>|#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Terms documented by a section: the code in the first cell of each table row. */
function definedTerms(md: string): string[] {
  const keys = new Set<string>();
  for (const row of md.match(/^\|[^\n]*$/gm) ?? []) {
    const first = (row.split('|')[1] ?? '').trim();
    if (!first.startsWith('`')) continue;
    for (const code of first.match(/`([^`]+)`/g) ?? []) for (const w of code.slice(1, -1).toLowerCase().match(/[a-zäöüß][\w.-]*/g) ?? []) keys.add(w);
  }
  return [...keys];
}

function highlighted(code: string): string {
  return highlightSource(code)
    .map((s) => (s.cls ? `<span class="hl-${s.cls}">${esc(s.text)}</span>` : esc(s.text)))
    .join('');
}

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort();
  } catch {
    return [];
  }
}

/**
 * Parameters in a predictable order: positional ones as written, then keys in the order of the
 * language vocabulary (position, size, paint, text …, meta keys last), then anything else.
 */
function orderParams(op: OpDoc): void {
  const vocab = KEYS_BY_VERB[op.verb] ?? [];
  const rank = (p: ParamDoc): number => {
    if (p.positional) return -1;
    const i = Math.min(...p.keys.map((k) => vocab.indexOf(k)).filter((x) => x >= 0));
    return Number.isFinite(i) ? i : vocab.length;
  };
  const indexed = op.params.map((p, i) => ({ p, i, r: rank(p) }));
  indexed.sort((a, b) => a.r - b.r || a.i - b.i);
  op.params = indexed.map((x) => x.p);
}

/** Load the operation reference from docs/reference. */
export async function loadReference(): Promise<{ categories: CategoryDoc[]; ops: OpDoc[] }> {
  const refDir = join(docsDir, 'reference');
  const shared = parseShared(await readFile(join(refDir, '_parameter.md'), 'utf8'));
  const categories: CategoryDoc[] = [];
  const ops: OpDoc[] = [];
  for (const slug of REFERENCE_CATEGORIES) {
    const catFile = `reference/${slug}.md`;
    categories.push(parseCategory(await readFile(join(docsDir, catFile), 'utf8'), catFile, slug));
    for (const f of await listMarkdown(join(refDir, slug))) {
      const file = `reference/${slug}/${f}`;
      const op = parseOp(await readFile(join(docsDir, file), 'utf8'), file, slug, shared);
      orderParams(op);
      ops.push(op);
    }
  }
  return { categories, ops };
}

/** Build the static docs site into `outDir`. */
export async function buildDocs(outDir: string): Promise<BuildReport> {
  const sources = new Map<string, string>();
  for (const f of new Set(PAGES.map((p) => p.file))) sources.set(f, await readFile(join(docsDir, f), 'utf8'));
  const { categories, ops } = await loadReference();

  // ---------------------------------------------------------------- pages in sidebar order
  const pages: Built[] = [];
  const opSlug = (op: OpDoc): string => `${REFERENCE_SLUG}/${op.category}/${op.verb}`;
  for (const p of PAGES) {
    pages.push({ slug: p.slug, title: p.title, group: p.group, kind: 'section', file: p.file, ...(p.heading ? { heading: p.heading } : {}) });
    if (p.slug === `${REFERENCE_SLUG}/operationen`) {
      for (const c of categories) {
        pages.push({ slug: `${REFERENCE_SLUG}/${c.slug}`, title: c.title, group: 'Referenz', kind: 'category', file: c.file, category: c });
        const order = (op: OpDoc): number => {
          const i = c.ops.indexOf(op.verb);
          return i < 0 ? c.ops.length : i;
        };
        for (const op of ops.filter((o) => o.category === c.slug).sort((a, b) => order(a) - order(b))) {
          pages.push({ slug: opSlug(op), title: op.verb, group: 'Referenz', kind: 'op', parent: `${REFERENCE_SLUG}/${c.slug}`, file: op.file, op });
        }
      }
    }
  }
  const documented = new Map<string, OpDoc>();
  for (const op of ops) for (const v of [op.verb, ...op.aliases]) documented.set(v, op);

  // ---------------------------------------------------------------- link targets
  // "<docs-relative file>#<anchor>" -> page and anchor on the site
  const anchors = new Map<string, { slug: string; id: string | null }>();
  for (const p of pages) {
    if (p.kind !== 'section') {
      anchors.set(`${p.file}#`, { slug: p.slug, id: null });
      continue;
    }
    const md = sources.get(p.file) as string;
    const hs = headingsOf(md);
    const start = p.heading ? hs.findIndex((h) => h.text === p.heading) : -1;
    if (start >= 0) {
      const h = hs[start];
      if (h) anchors.set(`${p.file}#${h.slug}`, { slug: p.slug, id: null });
      for (const sub of hs.slice(start + 1)) {
        if (h && sub.level <= h.level) break;
        anchors.set(`${p.file}#${sub.slug}`, { slug: p.slug, id: sub.slug });
      }
    }
    if (!anchors.has(`${p.file}#`)) anchors.set(`${p.file}#`, { slug: p.slug, id: null });
  }

  // ---------------------------------------------------------------- example rendering setup
  const fonts: LoadedFont[] = [];
  for (const f of FONT_FILES) {
    const data = await readFile(join(FONT_SRC, f.file));
    fonts.push({ family: 'Inter', weight: f.weight, italic: f.italic, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer });
  }
  const measurer = createFontMeasurer(fonts);
  const guideTheme = await readFile(GUIDE_THEME, 'utf8');
  const imageSizes: Record<string, ImageSize> = {};
  for (const img of IMAGES) {
    const size = imageSize(new Uint8Array(await readFile(img)));
    const name = img.split('/').pop() as string;
    if (size) for (const p of [`./img/${name}`, `img/${name}`, name]) imageSizes[p] = size;
  }
  const themes = [
    { name: 'standard', doc: null },
    { name: 'guide', doc: parse(guideTheme) },
  ];

  const report: BuildReport = { pages: 0, examples: 0, rendered: 0, codeOnly: 0, failed: [], warned: [], searchEntries: 0, documented };
  const search: SearchEntry[] = [];
  await rm(outDir, { recursive: true, force: true });

  for (const page of pages) {
    const root = rootOf(page.slug);
    const toc: TocEntry[] = [];
    let exampleNo = 0;
    const ctx: ExampleContext = { themes, measurer, imageSizes, resolveAsset: assetResolver(root) };
    const fileDir = posix.dirname(page.file);

    /** Links in the Markdown: other docs files become site pages, repository files GitHub links. */
    const rewrite = (href: string): string => {
      if (/^(https?:|mailto:)/.test(href)) return href;
      const [path = '', hash] = href.split('#') as [string, string | undefined];
      if (!path) {
        const hit = anchors.get(`${page.file}#${hash ?? ''}`);
        if (page.kind !== 'section' || !hit) return href;
        return `${hit.slug === page.slug ? '' : hrefOf(page.slug, hit.slug)}${hit.id ? `#${hit.id}` : hit.slug === page.slug ? '#' : ''}`;
      }
      if (!/\.md$|\/$|^\.\.?\/|^\//.test(path)) return `${root}${href.replace(/^\.\//, '')}`; // site path relative to the docs root
      // "/x.md" is relative to docs/ (shared parameters), anything else to the page's source file
      const target = (path.startsWith('/') ? path.slice(1) : normalize(posix.join(fileDir, path))).split('\\').join('/');
      if (target.endsWith('.md') && !target.startsWith('..')) {
        const hit = anchors.get(`${target}#${hash ?? ''}`) ?? anchors.get(`${target}#`);
        if (hit) return `${hrefOf(page.slug, hit.slug)}${hit.id ? `#${hit.id}` : hash && !anchors.has(`${target}#${hash}`) ? `#${hash}` : ''}`;
        return `${REPO_URL}/blob/HEAD/docs/${target}${hash ? `#${hash}` : ''}`;
      }
      const repoPath = normalize(posix.join('docs', target)).split('\\').join('/');
      if (!repoPath.startsWith('..')) return `${REPO_URL}/${repoPath.endsWith('/') || !/\.\w+$/.test(repoPath) ? 'tree' : 'blob'}/HEAD/${repoPath.replace(/\/$/, '')}`;
      return href;
    };

    const marked = new Marked({
      gfm: true,
      renderer: {
        heading({ tokens, depth }: Tokens.Heading): string {
          const html = this.parser.parseInline(tokens);
          const id = githubSlug(html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
          if (depth <= 3) toc.push({ level: depth, id, html: html.replace(/<a [^>]*>|<\/a>/g, '') });
          return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${html}</h${depth}>\n`;
        },
        code({ text, lang }: Tokens.Code): string {
          if (!isFormeCode(text, lang)) return `<pre class="code"><code>${esc(text)}</code></pre>\n`;
          report.examples++;
          const pre = `<pre class="code forme"><code>${highlighted(text)}</code></pre>`;
          const ex = prepareExample(text);
          if (!ex) {
            report.codeOnly++;
            return `${pre}\n`;
          }
          const res = renderExample(ex, ctx, `${page.slug.replace(/\W/g, '_') || 'start'}-${exampleNo++}`);
          const intended = showsError(text) && res.errors.length > 0;
          if (page.kind !== 'section' && res.warnings.length) report.warned.push({ page: page.slug, code: text, warnings: res.warnings });
          if (!res.slides.length || (res.errors.length && !intended)) {
            // fragments that need context from elsewhere, hidden slides: code only
            if (res.errors.length) report.failed.push({ page: page.slug, code: text, errors: res.errors });
            else report.codeOnly++;
            return `${pre}\n`;
          }
          report.rendered++;
          const slides = res.slides.map((svg) => `<div class="slide">${svg}</div>`).join('');
          const errors = intended ? `<ul class="example-errors">${res.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
          const wide = Math.max(...text.split('\n').map((l) => l.length)) > 50 || ex.theme !== undefined ? ' wide' : '';
          return `<figure class="example${res.slides.length > 1 ? ' multi' : ''}${wide}" data-theme="${res.theme}"><div class="example-code">${pre}<button class="edit" type="button">Bearbeiten</button></div><div class="example-preview">${slides}${errors}</div></figure>\n`;
        },
        link({ href, title, tokens }: Tokens.Link): string {
          const target = rewrite(href);
          const ext = /^https?:/.test(target) ? ' rel="noopener"' : '';
          return `<a href="${esc(target)}"${title ? ` title="${esc(title)}"` : ''}${ext}>${this.parser.parseInline(tokens)}</a>`;
        },
        table(token: Tokens.Table): string {
          const head = `<tr>${token.header.map((c, i) => `<th${token.align[i] ? ` style="text-align:${token.align[i]}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('')}</tr>`;
          const rows = token.rows.map((r) => `<tr>${r.map((c, i) => `<td${token.align[i] ? ` style="text-align:${token.align[i]}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
          return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
        },
      },
    });
    const md = (text: string): string => marked.parse(text.replace(/<!--[\s\S]*?-->/g, '')) as string;
    const inline = (text: string): string => marked.parseInline(text) as string;

    let body: string;
    let sourceUrl: string;
    let crumb = esc(page.group);
    const pageUrl = page.slug ? `${page.slug}/` : '';

    if (page.kind === 'section') {
      const src = sources.get(page.file) as string;
      const { body: section, startLine } = extractSection(src, page.heading);
      body = md(section);
      if (page.slug === `${REFERENCE_SLUG}/operationen`) body += allOperations(page, pages, categories, documented, inline, toc);
      sourceUrl = `${REPO_URL}/blob/HEAD/docs/${page.file}#L${startLine + 1}`;
      // search: one entry per section of the page
      const parts = section.split(/^(?=#{2,3}\s)/m);
      parts.forEach((part, i) => {
        const m = /^(#{2,3})\s+(.*)\n/.exec(part);
        const heading = m ? (m[2] as string).replace(/[`*]/g, '') : '';
        const text = plain(m ? part.slice(m[0].length) : part).slice(0, 3000);
        if (!heading && !text) return;
        const keys = definedTerms(m ? part.slice(m[0].length) : part);
        search.push({ url: `${pageUrl}${heading ? `#${githubSlug(heading)}` : ''}`, page: page.title, heading: i === 0 && !m ? '' : heading, text, keys });
      });
    } else if (page.kind === 'category') {
      const c = page.category as CategoryDoc;
      const rows = c.ops
        .map((verb) => {
          const op = documented.get(verb);
          if (!op) throw new Error(`Kategorie ${c.slug}: Operation „${verb}“ ist nicht dokumentiert`);
          const target = pages.find((x) => x.op === op) as Built;
          const anchor = verb === op.verb ? '' : `#${githubSlug(verb)}`;
          const summary = verb === op.verb ? op.summary : (op.sections.find((s) => s.title === verb)?.body.split('\n')[0] ?? op.summary);
          return `<tr><td><a href="${hrefOf(page.slug, target.slug)}${anchor}"><code>${esc(verb)}</code></a></td><td>${inline(summary)}</td></tr>`;
        })
        .join('');
      body =
        md(c.intro) +
        `<h2 id="operationen"><a class="anchor" href="#operationen" aria-hidden="true">#</a>Operationen</h2>\n<div class="table-wrap defs"><table><tbody>${rows}</tbody></table></div>\n` +
        c.sections.map((s) => md(`## ${s.title}\n\n${s.body}`)).join('');
      toc.unshift({ level: 2, id: 'operationen', html: 'Operationen' });
      sourceUrl = `${REPO_URL}/blob/HEAD/docs/${c.file}`;
      search.push({ url: pageUrl, page: c.title, heading: '', text: plain(`${c.summary} ${c.intro}`).slice(0, 3000), keys: [] });
    } else {
      const op = page.op as OpDoc;
      const cat = categories.find((c) => c.slug === op.category) as CategoryDoc;
      crumb = `${esc(page.group)} · <a href="${hrefOf(page.slug, `${REFERENCE_SLUG}/${cat.slug}`)}">${esc(cat.title)}</a>`;
      body = `${op.summary ? `<p class="lead">${inline(op.summary)}</p>` : ''}${md(op.intro)}`;
      for (const s of op.sections) body += s.title === PARAMETER_SECTION ? renderParams(op, s, md, inline, toc) : md(`## ${s.title}\n\n${s.body}`);
      sourceUrl = `${REPO_URL}/blob/HEAD/docs/${op.file}`;
      search.push({ url: pageUrl, page: op.verb, heading: '', text: plain(`${op.summary} ${op.intro}`).slice(0, 3000), keys: [op.verb, ...op.aliases] });
      for (const s of op.sections) if (s.title !== PARAMETER_SECTION) search.push({ url: `${pageUrl}#${githubSlug(s.title)}`, page: op.verb, heading: s.title, text: plain(s.body).slice(0, 2000), keys: s.title === op.verb || op.aliases.includes(s.title) ? [s.title] : [] });
      for (const p of op.params) search.push({ url: `${pageUrl}#${p.id}`, page: op.verb, heading: p.keys.join(', '), text: plain(p.body).slice(0, 1000), keys: [] });
    }

    const file = join(outDir, page.slug, 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, pageHtml(page, pages, { body, toc: toc.filter((t) => t.level <= 3), sourceUrl, crumb, codeTitle: page.kind === 'op' }));
    report.pages++;
  }

  // ---------------------------------------------------------------- assets
  const assets = join(outDir, 'assets');
  await mkdir(join(assets, 'fonts'), { recursive: true });
  await mkdir(join(assets, 'img'), { recursive: true });
  for (const f of [...FONT_FILES.map((x) => x.file), 'OFL-Inter.txt']) await cp(join(FONT_SRC, f), join(assets, 'fonts', f));
  for (const img of IMAGES) await cp(img, join(assets, 'img', img.split('/').pop() as string));
  await cp(join(app, 'src/style.css'), join(assets, 'style.css'));
  await writeFile(join(assets, 'search.json'), JSON.stringify(search));
  await writeFile(join(assets, 'examples.json'), JSON.stringify({ themes: { guide: guideTheme }, imageSizes, fonts: FONT_FILES }));
  await esbuild({
    entryPoints: { client: join(app, 'src/client/main.ts') },
    outdir: assets,
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    chunkNames: 'chunks/[name]-[hash]',
    logLevel: 'warning',
    legalComments: 'none',
  });
  report.searchEntries = search.length;
  return report;
}

/** The generated overview of every operation, grouped by category (page "Alle Operationen"). */
function allOperations(page: SitePage, pages: Built[], categories: CategoryDoc[], documented: Map<string, OpDoc>, inline: (s: string) => string, toc: TocEntry[]): string {
  return categories
    .map((c) => {
      const id = githubSlug(c.title);
      toc.push({ level: 2, id, html: esc(c.title) });
      const rows = c.ops
        .map((verb) => {
          const op = documented.get(verb) as OpDoc;
          const target = pages.find((x) => x.op === op) as Built;
          const anchor = verb === op.verb ? '' : `#${githubSlug(verb)}`;
          return `<tr><td><a href="${hrefOf(page.slug, target.slug)}${anchor}"><code>${esc(verb)}</code></a></td><td>${inline(verb === op.verb ? op.summary : (op.sections.find((s) => s.title === verb)?.body.split('\n')[0] ?? op.summary))}</td></tr>`;
        })
        .join('');
      return `<h2 id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a><a href="${hrefOf(page.slug, `${REFERENCE_SLUG}/${c.slug}`)}">${esc(c.title)}</a></h2>\n<div class="table-wrap defs"><table><tbody>${rows}</tbody></table></div>\n`;
    })
    .join('');
}

const TYPE_CLASS: Record<string, string> = {
  Länge: 'length',
  Zahl: 'number',
  Farbe: 'color',
  Text: 'string',
  ID: 'id',
  Name: 'name',
  Wahrheitswert: 'bool',
  Auswahl: 'enum',
  Pfad: 'string',
  Region: 'name',
  Stil: 'name',
  Ausdruck: 'length',
  Größe: 'number',
};

/** The Parameter section of an operation: signature line and one card per parameter. */
function renderParams(op: OpDoc, section: Section, md: (s: string) => string, inline: (s: string) => string, toc: TocEntry[]): string {
  const intro = section.body.split(/^### /m)[0]?.replace(/<!--[\s\S]*?-->/g, '').trim() ?? '';
  toc.push({ level: 2, id: 'parameter', html: 'Parameter' });
  const sig = signatureOf(op)
    .map((s) => {
      const label = s.label.startsWith('@') || s.label.startsWith('"') ? esc(s.label) : s.positional ? `&lt;${esc(s.label)}&gt;` : `${esc(s.label)}=`;
      return `<a class="sig-param${s.positional ? ' positional' : ''}" href="#${s.id}"><span class="sig-key">${label}</span>${!s.positional && s.type ? `<span class="sig-type">${esc(s.type)}</span>` : ''}</a>`;
    })
    .join(' ');
  const cards = op.params
    .map((p: ParamDoc) => {
      toc.push({ level: 3, id: p.id, html: `<code>${esc(groupLabel(p.keys))}</code>` });
      const types = p.types.map((t) => `<span class="type t-${TYPE_CLASS[t] ?? 'other'}">${esc(t)}</span>`).join('');
      const badges = `${p.required ? '<span class="badge req">erforderlich</span>' : ''}${p.positional ? '<span class="badge pos">positional</span>' : ''}${p.shared ? '<span class="badge shared">gemeinsam</span>' : ''}`;
      const values = p.values.length ? `<p class="param-values">Werte: ${p.values.map((v) => `<code>${esc(v)}</code>`).join(' ')}</p>` : '';
      const def = p.default ? `<p class="param-default">Standard: ${inline(p.default)}</p>` : '';
      return `<section class="param" id="${p.id}"><h3><a class="param-name" href="#${p.id}">${p.keys.map((k) => `<code>${esc(k)}</code>`).join('<span class="sep">,</span> ')}</a>${types}${badges}</h3>${values}<div class="param-body">${md(p.body)}</div>${def}</section>`;
    })
    .join('\n');
  return `<h2 id="parameter"><a class="anchor" href="#parameter" aria-hidden="true">#</a>Parameter</h2>\n<div class="signature"><code><span class="sig-verb">${esc(op.verb)}</span> ${sig}</code></div>\n${intro ? md(intro) : ''}<div class="params">${cards}</div>\n`;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = resolve(process.argv[2] ?? join(app, 'dist'));
  const r = await buildDocs(out);
  console.log(`Dokumentation: ${r.pages} Seiten, ${r.rendered}/${r.examples} Beispiele gerendert (${r.codeOnly} nur Code), ${r.searchEntries} Suchabschnitte → ${out}`);
  for (const f of r.failed) console.error(`  Beispiel ohne Vorschau auf /${f.page}: ${f.errors.join('; ') || 'keine Folien'}\n    ${f.code.split('\n')[0]}`);
  for (const w of r.warned) console.error(`  Warnung im Beispiel auf /${w.page}: ${w.warnings.join('; ')}\n    ${w.code.split('\n')[0]}`);
}
