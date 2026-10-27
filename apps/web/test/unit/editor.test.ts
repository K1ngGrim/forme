import { describe, expect, it } from 'vitest';
import { evaluate, parse } from '@forme/core';
import { completeLine } from '../../src/complete.js';
import { normalizePath, relativeTo, resolveFrom } from '../../src/platform/paths.js';

const scene = evaluate(parse('slide @a layout=content\n  rect @box\n  text @t "x"\n'));
const slide = scene.slides[0]!;
const labels = (line: string, col = line.length): string[] => completeLine(line, col, scene, slide)?.items.map((i) => i.label) ?? [];

describe('completion', () => {
  it('completes verbs at line start', () => {
    expect(labels('  re')).toEqual(expect.arrayContaining(['rect', 'resize', 'region']));
  });
  it('completes ids, tokens and keys', () => {
    expect(labels('  align left @')).toEqual(expect.arrayContaining(['@box', '@t', '@title', '@pagenum']));
    expect(labels('  rect @r x=$')).toEqual(expect.arrayContaining(['$margin', '$primary']));
    expect(labels('  rect @r f')).toContain('fill=');
    expect(labels('  text @t "a" style=')).toEqual(expect.arrayContaining(['h1', 'body']));
    expect(labels('  distribute ')).toEqual(expect.arrayContaining(['h', 'v']));
    expect(labels('  distribute h @a within=')).toEqual(expect.arrayContaining(['slide', 'content']));
  });
});

describe('project paths', () => {
  it('resolves paths relative to the referencing file', () => {
    expect(resolveFrom('deck.forme', './img/x.png')).toBe('img/x.png');
    expect(resolveFrom('talks/deck.forme', '../themes/a.forme')).toBe('themes/a.forme');
    expect(resolveFrom('deck.forme', '/fonts/a.woff')).toBe('fonts/a.woff');
  });
  it('never leaves the project folder', () => {
    expect(resolveFrom('deck.forme', '../x.png')).toBeNull();
    expect(normalizePath('a/../../b')).toBeNull();
    expect(resolveFrom('deck.forme', 'https://example.org/x.png')).toBeNull();
  });
  it('writes paths as seen from a file', () => {
    expect(relativeTo('deck.forme', 'img/a.png')).toBe('./img/a.png');
    expect(relativeTo('talks/deck.forme', 'img/a.png')).toBe('../img/a.png');
    expect(relativeTo('talks/deck.forme', 'talks/img/a.png')).toBe('./img/a.png');
  });
});

describe('container completion', () => {
  const s2 = evaluate(parse('slide @a\n  row @r\n'));
  it('offers flex alignment values for rows and columns', () => {
    const r = completeLine('  row @r align=', 15, s2, s2.slides[0]!);
    expect(r?.items.map((i) => i.label)).toEqual(['start', 'center', 'end', 'stretch']);
    expect(completeLine('  ', 2, s2, s2.slides[0]!)?.items.map((i) => i.label)).toEqual(expect.arrayContaining(['row', 'column']));
  });
});
