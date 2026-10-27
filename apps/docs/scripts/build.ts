import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { highlightSource, imageSize, parse } from '@forme/core';
import type { ImageSize } from '@forme/core';
import { createFontMeasurer } from '@forme/render';
import type { LoadedFont } from '@forme/render';
import { build as esbuild } from 'esbuild';
import { Marked } from 'marked';
import type { Tokens } from 'marked';
import { assetResolver, isFormeCode, prepareExample, renderExample, showsError } from '../src/examples.js';
import type { ExampleContext } from '../src/examples.js';
import { esc, hrefOf, pageHtml, rootOf } from '../src/layout.js';
import type { TocEntry } from '../src/layout.js';
import { extractSection, githubSlug, headingsOf } from '../src/markdown.js';
import { PAGES, REPO_URL } from '../src/site.js';
import type { PageSpec } from '../src/site.js';

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
  searchEntries: number;
}

interface SearchEntry {
  /** Page path relative to the docs root, with optional #anchor. */
  url: string;
  page: string;
  heading: string;
  text: string;
  /** Terms this section defines: code in the first column of its tables (`distribute`, `forme watch`). */
  keys: string[];
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

function plain(md: string): string {
  return md
    .replace(/^```\w*$/gm, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>|#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function highlighted(code: string): string {
  return highlightSource(code)
    .map((s) => (s.cls ? `<span class="hl-${s.cls}">${esc(s.text)}</span>` : esc(s.text)))
    .join('');
}

/** Build the static docs site into `outDir`. */
export async function buildDocs(outDir: string): Promise<BuildReport> {
  const sources = new Map<string, string>();
  for (const f of new Set(PAGES.map((p) => p.file))) sources.set(f, await readFile(join(docsDir, f), 'utf8'));

  // anchors of the source files -> page + anchor on the site (for links like guide.md#5-...)
  const anchors = new Map<string, { slug: string; id: string | null }>();
  for (const p of PAGES) {
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

  // fonts, themes and images for the examples
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

  const report: BuildReport = { pages: 0, examples: 0, rendered: 0, codeOnly: 0, failed: [], searchEntries: 0 };
  const search: SearchEntry[] = [];
  await rm(outDir, { recursive: true, force: true });

  for (const page of PAGES) {
    const md = sources.get(page.file) as string;
    const { body, startLine } = extractSection(md, page.heading);
    const root = rootOf(page.slug);
    const toc: TocEntry[] = [];
    let exampleNo = 0;
    const ctx: ExampleContext = { themes, measurer, imageSizes, resolveAsset: assetResolver(root) };

    const rewrite = (href: string): string => {
      if (/^(https?:|mailto:)/.test(href)) return href;
      if (href.startsWith('#')) {
        const hit = anchors.get(`${page.file}${href}`);
        return hit ? `${hit.slug === page.slug ? '' : hrefOf(page.slug, hit.slug)}${hit.id ? `#${hit.id}` : hit.slug === page.slug ? '#' : ''}` : href;
      }
      const md = /^(?:\.\/)?([\w-]+\.md)(#.*)?$/.exec(href);
      if (md) {
        const hit = anchors.get(`${md[1]}${md[2] ?? '#'}`) ?? anchors.get(`${md[1]}#`);
        if (hit) return `${hrefOf(page.slug, hit.slug)}${hit.id ? `#${hit.id}` : ''}`;
        return `${REPO_URL}/blob/HEAD/docs/${md[1]}${md[2] ?? ''}`;
      }
      const repoPath = /^\.\.\/((?:examples|packages|apps|docs)\/.*|CLAUDE\.md|README\.md)$/.exec(href);
      if (repoPath) return `${REPO_URL}/${(repoPath[1] as string).endsWith('/') ? 'tree' : 'blob'}/HEAD/${repoPath[1]}`;
      return `${root}${href.replace(/^\.\//, '')}`;
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
          if (!res.slides.length || (res.errors.length && !intended)) {
            // fragments that need context from elsewhere, hidden slides: code only
            if (res.errors.length) report.failed.push({ page: page.slug, code: text, errors: res.errors });
            else report.codeOnly++;
            return `${pre}\n`;
          }
          report.rendered++;
          const slides = res.slides.map((svg) => `<div class="slide">${svg}</div>`).join('');
          const errors = intended ? `<ul class="example-errors">${res.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
          const wide = Math.max(...text.split('\n').map((l) => l.length)) > 64 ? ' wide' : '';
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

    const html = await marked.parse(body);
    const sourceUrl = `${REPO_URL}/blob/HEAD/docs/${page.file}#L${startLine + 1}`;
    const file = join(outDir, page.slug, 'index.html');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, pageHtml(page, html, toc.filter((t) => t.level <= 3), sourceUrl));
    report.pages++;

    // search: one entry per section of the page
    const parts = body.split(/^(?=#{2,3}\s)/m);
    parts.forEach((part, i) => {
      const m = /^(#{2,3})\s+(.*)\n/.exec(part);
      const heading = m ? (m[2] as string).replace(/[`*]/g, '') : '';
      const text = plain(m ? part.slice(m[0].length) : part).slice(0, 3000);
      if (!heading && !text) return;
      const keys = definedTerms(m ? part.slice(m[0].length) : part);
      search.push({ url: `${page.slug ? `${page.slug}/` : ''}${heading ? `#${githubSlug(heading)}` : ''}`, page: page.title, heading: i === 0 && !m ? '' : heading, text, keys });
    });
  }

  // assets
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

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = resolve(process.argv[2] ?? join(app, 'dist'));
  const r = await buildDocs(out);
  console.log(`Dokumentation: ${r.pages} Seiten, ${r.rendered}/${r.examples} Beispiele gerendert (${r.codeOnly} nur Code), ${r.searchEntries} Suchabschnitte → ${out}`);
  for (const f of r.failed) console.error(`  Beispiel ohne Vorschau auf /${f.page}: ${f.errors.join('; ') || 'keine Folien'}\n    ${f.code.split('\n')[0]}`);
}
