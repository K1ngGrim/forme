import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate, parse } from '@forme/core';
import { renderDeckHtml, renderSlideSvg } from '../src/index.js';

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
    const s = evaluate(parse('slide @a layout=title\n  rect @r\n'));
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
    const s = evaluate(parse('slide @a\n  text @t "<b> & \\"q\\""\n'));
    expect(renderSlideSvg(s, s.slides[0]!)).toContain('&lt;b&gt; &amp; &quot;q&quot;');
  });
});
