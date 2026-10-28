import { ALL_VERBS, DEFAULT_THEME_SOURCE, evaluate, parse } from '@forme/core';
import type { DeckScene, Document, ImageSize, MathRenderer, TextMeasurer } from '@forme/core';
import { renderSlideSvg } from '@forme/render';

/**
 * Code examples in the docs. A Forme block that can stand on its own (a deck, slides or
 * slide-level operations) is rendered next to the code; fragments are shown as code only.
 * A block with a line `---` has theme code above it (added to the built-in theme) and deck
 * code below, so theme definitions can be shown with their effect.
 * Shared by the static build and the live editor in the browser.
 */

const DEFINITION_VERBS = new Set(['theme', 'size', 'token', 'color', 'font', 'style', 'master', 'layout', 'component', 'region', 'slot']);
const VERBS = new Set<string>([...ALL_VERBS, 'deck', 'slide', 'section', 'item', 'row', 'column']);

function firstOp(code: string): string | null {
  const line = code.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'));
  return line ? (/^\s*([A-Za-z_]\w*)/.exec(line)?.[1] ?? null) : null;
}

/** Is this fenced block Forme code (and not a shell command, a file tree or a table)? */
export function isFormeCode(code: string, lang: string | undefined): boolean {
  if (lang) return lang === 'forme';
  if (SEPARATOR.test(code)) return isFormeCode(code.replace(SEPARATOR, ''), lang);
  const verb = firstOp(code);
  return !!verb && VERBS.has(verb) && !/^\s*(forme|pnpm|npm|npx|code)\s/m.test(code);
}

export interface PreparedExample {
  /** Complete deck source that is evaluated. */
  source: string;
  /** The user's code was wrapped into a slide (indented by two spaces). */
  wrapped: boolean;
  /** Theme code of the example (added to the built-in theme). */
  theme?: string;
}

const SEPARATOR = /^---\s*$/m;

/** Turn a code block into a complete deck, or null when it cannot be shown on its own. */
export function prepareExample(code: string): PreparedExample | null {
  const sep = SEPARATOR.exec(code);
  if (sep) {
    const deck = prepareExample(code.slice(sep.index + sep[0].length).replace(/^\n/, ''));
    return deck ? { ...deck, theme: code.slice(0, sep.index) } : null;
  }
  const verb = firstOp(code);
  if (!verb || DEFINITION_VERBS.has(verb)) return null;
  // fragments that only make sense inside another block (list items, table rows, placeholders)
  if (/^\s/.test(code.split('\n').find((l) => l.trim() && !l.trim().startsWith('//')) ?? '')) return null;
  // placeholders like `<region>` or `…` in the code itself (not in strings or comments)
  const bare = code.replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/\/\/.*$/gm, '');
  if (/<[a-z]/.test(bare) || /…|\.\.\./.test(bare)) return null;
  // included files are not available to the examples
  if (/^\s*include\b/m.test(code)) return null;
  if (/^deck\b/m.test(code)) return { source: code, wrapped: false };
  if (/^slide\b/m.test(code)) return { source: `deck "Beispiel"\n\n${code}`, wrapped: false };
  const body = code
    .split('\n')
    .map((l) => (l.trim() ? `  ${l}` : l))
    .join('\n');
  return { source: `deck "Beispiel"\n\nslide @beispiel layout=content {\n${body.replace(/\n*$/, '')}\n}\n`, wrapped: true };
}

export interface ExampleContext {
  /** Themes to try in order (null = built-in theme). The first one without errors wins. */
  themes: { name: string; doc: Document | null }[];
  measurer: TextMeasurer;
  imageSizes: Record<string, ImageSize>;
  resolveAsset: (path: string) => string;
  math?: MathRenderer;
}

export interface RenderedExample {
  theme: string;
  slides: string[];
  errors: string[];
  warnings: string[];
}

const MAX_SLIDES = 4;

/** Layouts tried for code that was wrapped into a slide (fragments using `col1` need `columns`). */
const WRAP_LAYOUTS = ['content', 'columns', 'blank'];

/** `prefix` keeps ids inside the SVGs unique when several examples share one page. */
export function renderExample(ex: PreparedExample, ctx: ExampleContext, prefix: string): RenderedExample {
  let first: RenderedExample | null = null;
  const themes = ex.theme !== undefined ? [{ name: 'example', doc: parse(`${DEFAULT_THEME_SOURCE}\n${ex.theme}`) }] : ctx.themes;
  for (const t of themes) {
    const layouts = ex.wrapped ? WRAP_LAYOUTS : [null];
    for (const layout of layouts) {
      const source = layout ? ex.source.replace('slide @beispiel layout=content', `slide @beispiel layout=${layout}`) : ex.source;
      const scene: DeckScene = evaluate(parse(source), { theme: t.doc, measurer: ctx.measurer, imageSizes: ctx.imageSizes, ...(ctx.math ? { math: ctx.math } : {}) });
      if (layout && !scene.theme.layouts.includes(layout)) continue;
      const errors = scene.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
      const warnings = scene.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
      const slides = scene.slides
        .filter((s) => !s.hidden)
        .slice(0, MAX_SLIDES)
        .map((s) => renderSlideSvg(scene, s, { resolveAsset: ctx.resolveAsset, idPrefix: `${prefix}-${s.id}-` }));
      const res = { theme: t.name, slides, errors, warnings };
      if (!errors.length && slides.length) return res;
      first ??= res;
    }
  }
  return first ?? { theme: '', slides: [], errors: ['Kein Theme'], warnings: [] };
}

/** An example that shows an error on purpose (marked with a `// FEHLER` comment). */
export function showsError(code: string): boolean {
  return /\/\/\s*fehler/i.test(code);
}

/** Relative image paths in examples (`./img/umsatz.svg`) point to the docs' asset folder. */
export function assetResolver(root: string): (p: string) => string {
  return (p) => (/^(https?|data):/.test(p) ? p : `${root}assets/img/${p.split('/').pop() ?? p}`);
}
