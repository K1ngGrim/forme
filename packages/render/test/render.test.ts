import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate, parse } from '@forme/core';
import { renderDeckHtml, renderSlideSvg } from '../src/index.js';
import { createMathRenderer } from '../src/math.js';

const root = resolve(__dirname, '../../../examples');
const ex = (p: string): string => readFileSync(resolve(root, p), 'utf8');

describe('svg renderer', () => {
  const scene = evaluate(parse(ex('deck.forme')), { theme: parse(ex('themes/corporate.forme')) });

  it.each(scene.slides.map((s) => [s.id]))('golden: slide %s', async (id) => {
    const slide = scene.slides.find((s) => s.id === id)!;
    const svg = renderSlideSvg(scene, slide);
    expect(svg.startsWith('<svg')).toBe(true);
    await expect(svg.replace(/></g, '>\n<')).toMatchFileSnapshot(resolve(root, `__golden__/deck.${id}.svg`));
  });

  it('marks ids and placeholders only in editor mode', () => {
    const s = evaluate(parse('slide @a layout=title {\n  rect @r\n}\n'));
    const editor = renderSlideSvg(s, s.slides[0]!, { editor: true });
    const print = renderSlideSvg(s, s.slides[0]!);
    expect(editor).toContain('data-id="r"');
    expect(editor).toContain('stroke-dasharray="8 6"');
    expect(print).not.toContain('data-id');
    expect(print).not.toContain('Untertitel');
  });

  it('builds a printable html document', () => {
    const html = renderDeckHtml(scene);
    expect(html).toContain('@page { size: 1920px 1080px');
    expect(html.match(/class="page"/g)?.length).toBe(3);
  });

  it('escapes text', () => {
    const s = evaluate(parse('slide @a {\n  text @t "<b> & \\"q\\""\n}\n'));
    expect(renderSlideSvg(s, s.slides[0]!)).toContain('&lt;b&gt; &amp; &quot;q&quot;');
  });
});

describe('math', () => {
  it('typesets TeX with MathJax and embeds it as nested SVG in the theme color', () => {
    const math = createMathRenderer();
    const r = math('\\frac{1}{2}', true);
    expect(r.error).toBeUndefined();
    expect(r.w).toBeGreaterThan(0.3);
    expect(r.h).toBeGreaterThan(1);
    expect(math('\\frac{1', true).error).toBe('Missing close brace');
    const scene = evaluate(parse('slide @a {\n  math @f x=100 y=100 size=60 color=#DC2626 """\\sqrt{x}"""\n}\n'), { math });
    expect(scene.diagnostics).toEqual([]);
    const svg = renderSlideSvg(scene, scene.slides[0]!);
    expect(svg).toMatch(/<svg x="100" y="100" width="[\d.]+" height="[\d.]+" viewBox="[-\d. ]+" preserveAspectRatio="xMidYMid meet" overflow="visible" color="#DC2626">/);
    expect(svg).toContain('data-mml-node="msqrt"');
  });
});
