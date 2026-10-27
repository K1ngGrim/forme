import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDocs } from '../scripts/build.js';
import type { BuildReport } from '../scripts/build.js';
import { prepareExample, isFormeCode } from '../src/examples.js';
import { extractSection, githubSlug } from '../src/markdown.js';
import { PAGES } from '../src/site.js';

let out = '';
let report: BuildReport;

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? htmlFiles(p) : f.endsWith('.html') ? [p] : [];
  });
}

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'forme-docs-'));
  report = await buildDocs(out);
}, 60_000);
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('docs site', () => {
  it('builds every page with assets', () => {
    expect(report.pages).toBe(PAGES.length);
    for (const p of PAGES) expect(existsSync(join(out, p.slug, 'index.html'))).toBe(true);
    for (const f of ['assets/style.css', 'assets/client.js', 'assets/search.json', 'assets/examples.json', 'assets/fonts/inter-latin-400-normal.woff', 'assets/img/umsatz.svg']) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
  });

  it('renders the examples with the real compiler', () => {
    expect(report.rendered).toBeGreaterThanOrEqual(15);
    // only fragments that reference objects from elsewhere stay code-only
    expect(report.failed.length).toBeLessThanOrEqual(3);
    const container = readFileSync(join(out, 'referenz/container/index.html'), 'utf8');
    expect(container).toMatch(/<figure class="example[^"]*"[^>]*>.*<svg /s);
  });

  it('has no broken internal links or anchors', () => {
    const broken: string[] = [];
    for (const file of htmlFiles(out)) {
      const html = readFileSync(file, 'utf8');
      for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const href = (m[1] as string).replace(/&amp;/g, '&');
        if (/^(https?:|mailto:|data:)/.test(href)) continue;
        const [path, hash] = href.split('#') as [string, string | undefined];
        const target = path ? resolve(dirname(file), path) : file;
        if (relative(out, target).startsWith('..')) continue; // the editor app next to the docs
        const page = existsSync(target) && statSync(target).isDirectory() ? join(target, 'index.html') : target;
        if (!existsSync(page)) {
          broken.push(`${relative(out, file)} -> ${href}`);
          continue;
        }
        if (hash && page.endsWith('.html') && !readFileSync(page, 'utf8').includes(`id="${hash}"`)) broken.push(`${relative(out, file)} -> ${href} (Anker)`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('indexes every page for the search', () => {
    const index = JSON.parse(readFileSync(join(out, 'assets/search.json'), 'utf8')) as { page: string; keys: string[] }[];
    expect(new Set(index.map((e) => e.page)).size).toBe(PAGES.length);
    expect(index.some((e) => e.keys.includes('distribute'))).toBe(true);
  });
});

describe('docs helpers', () => {
  it('extracts a section and shifts its headings', () => {
    const md = '# T\n\n## A\n\ntext\n\n### A1\n\nmore\n\n## B\n\nb';
    expect(extractSection(md, 'A').body).toBe('text\n\n## A1\n\nmore');
    expect(extractSection(md).body).toContain('## B');
  });

  it('builds GitHub anchors', () => {
    expect(githubSlug('10. Regeln für KI-Assistenten')).toBe('10-regeln-für-ki-assistenten');
    expect(githubSlug('Layout-Container (`row`, `column`)')).toBe('layout-container-row-column');
  });

  it('decides which code blocks are Forme and how they are shown', () => {
    expect(isFormeCode('forme watch deck.forme', undefined)).toBe(false);
    expect(isFormeCode('rect @a x=1', undefined)).toBe(true);
    expect(prepareExample('theme "T"\ncolor primary #fff')).toBeNull();
    expect(prepareExample('rect @a x=1 // see <region>')?.wrapped).toBe(true);
    expect(prepareExample('slide @a\n  …')).toBeNull();
    expect(prepareExample('text @a "…" x=1')).not.toBeNull();
  });
});
