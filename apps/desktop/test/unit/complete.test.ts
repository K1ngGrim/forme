import { describe, expect, it } from 'vitest';
import { evaluate, parse } from '@forme/core';
import { completeLine } from '../../src/renderer/src/complete.js';
import { joinPath, dirOf } from '../../src/renderer/src/paths.js';

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

describe('paths', () => {
  it('joins relative paths', () => {
    expect(joinPath('/a/b', './img/x.png')).toBe('/a/b/img/x.png');
    expect(joinPath('/a/b', '../x.png')).toBe('/a/x.png');
    expect(joinPath('C:\\deck', 'img\\x.png')).toBe('C:\\deck\\img\\x.png');
    expect(dirOf('/a/b/deck.forme')).toBe('/a/b');
  });
});
