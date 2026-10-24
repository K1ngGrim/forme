import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lex, parse, print, walkOps, DEFAULT_THEME_SOURCE } from '../src/index.js';

const ex = (p: string): string => readFileSync(resolve(__dirname, '../../../examples', p), 'utf8');

describe('lexer', () => {
  it('is lossless', () => {
    const src = 'rect @a x=(slide.w - 2*$margin) fill=#fff // hi\r\n  text "a \\"b\\"" ✓\t€';
    expect(lex(src).map((t) => t.text).join('')).toBe(src);
  });
  it('lexes literals', () => {
    const kinds = lex('size 1920x1080 50% 12px $space.l @box.x #1E40AF').filter((t) => t.kind !== 'ws').map((t) => `${t.kind}:${t.text}`);
    expect(kinds).toEqual(['ident:size', 'dim:1920x1080', 'number:50%', 'number:12px', 'token:$space.l', 'id:@box', 'punct:.', 'ident:x', 'color:#1E40AF']);
  });
});

describe('parser', () => {
  const samples = [
    ex('deck.forme'),
    ex('themes/corporate.forme'),
    DEFAULT_THEME_SOURCE,
    '',
    '\n\n',
    'slide @a\n  rect @r x=( 1 +\n',
    '  oops\n\tx = 3 "unterminated\n???\n',
    'deck "x"\r\nslide\r\n  text "a"',
  ];
  it.each(samples.map((s, i) => [i, s]))('round-trips sample %i', (_i, src) => {
    expect(print(parse(src as string))).toBe(src);
  });

  it('builds blocks by indentation', () => {
    const doc = parse('slide @a\n  rect @r\n  group @g\n    text @t "x"\nslide @b\n');
    expect(doc.ops.map((o) => o.verb)).toEqual(['slide', 'slide']);
    const a = doc.ops[0]!;
    expect(a.children.map((c) => c.verb)).toEqual(['rect', 'group']);
    expect(a.children[1]!.children[0]!.verb).toBe('text');
    expect(doc.source.slice(a.line.start, a.blockEnd)).toBe('slide @a\n  rect @r\n  group @g\n    text @t "x"');
  });

  it('parses keyed args and expressions', () => {
    const doc = parse('rect @r x=(slide.w - 2*$margin) y=@title.bottom+24 radius.tl=8');
    const op = doc.ops[0]!;
    expect(op.args.map((a) => a.key)).toEqual([undefined, 'x', 'y', 'radius.tl']);
    expect(op.args[1]!.value.k).toBe('paren');
    expect(op.args[2]!.value.k).toBe('bin');
    expect(doc.diagnostics).toEqual([]);
  });

  it('reports errors as data', () => {
    const doc = parse('rect @r x=(1 +\n  3abc\n"x"');
    expect(doc.diagnostics.length).toBeGreaterThan(0);
    expect(walkOps(doc.ops).length).toBe(1);
  });
});
