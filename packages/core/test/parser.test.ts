import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lex, migrate, needsMigration, parse, print, walkOps, DEFAULT_THEME_SOURCE } from '../src/index.js';

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
    'slide @a {\n  rect @r x=( 1 +\n}\n',
    '  oops\n\tx = 3 "unterminated\n???\n',
    'deck "x"\r\nslide {\r\n  text "a"\r\n}',
  ];
  it.each(samples.map((s, i) => [i, s]))('round-trips sample %i', (_i, src) => {
    expect(print(parse(src as string))).toBe(src);
  });

  it('builds blocks from braces', () => {
    const doc = parse('slide @a {\n  rect @r\n  group @g {\n    text @t "x"\n  }\n}\nslide @b\n');
    expect(doc.ops.map((o) => o.verb)).toEqual(['slide', 'slide']);
    const a = doc.ops[0]!;
    expect(a.children.map((c) => c.verb)).toEqual(['rect', 'group']);
    expect(a.children[1]!.children[0]!.verb).toBe('text');
    expect(doc.source.slice(a.line.start, a.blockEnd)).toBe('slide @a {\n  rect @r\n  group @g {\n    text @t "x"\n  }\n}');
  });

  it('accepts empty blocks, ops without block and comments after braces', () => {
    const doc = parse('slide @a {} // leer\nslide @b\nslide @c { // Kommentar\n  rect @r\n} // Ende\n');
    expect(doc.diagnostics).toEqual([]);
    expect(doc.ops.map((o) => o.children.length)).toEqual([0, 0, 1]);
    expect(doc.ops[0]!.close?.line).toBe(doc.ops[0]!.line);
    expect(doc.ops[1]!.open).toBeNull();
    expect(doc.lines[4]!.closes).toBe(doc.ops[2]);
  });

  it('reports missing and extra braces and the old indentation syntax', () => {
    const msgs = (src: string): string[] => parse(src).diagnostics.map((d) => d.message);
    expect(msgs('slide @a {\n  rect @r\n')).toEqual(['„}“ fehlt: Block von „slide“ wird nicht geschlossen']);
    expect(msgs('rect @r\n}\n')).toEqual(['„}“ ohne zugehörige „{“']);
    expect(msgs('slide @a {\n  rect @r\n} rect @q\n')[0]).toContain('Nach „}“ endet die Zeile');
    expect(msgs('slide @a { rect @r }\n')[0]).toContain('Nach „{“ endet die Zeile');
    expect(msgs('slide @a\n  rect @r\n')[0]).toContain('forme migrate');
    expect(msgs('slide @a\n{\n')[0]).toContain('Ende der Zeile');
  });

  it('keeps multi-line raw strings in one line, with continuation lines', () => {
    const src = 'slide @a {\n  text @t x=1 """\n    eins\n      zwei {x}\n  """\n  rect @r\n}\n';
    const doc = parse(src);
    expect(doc.diagnostics).toEqual([]);
    expect(print(doc)).toBe(src);
    const slide = doc.ops[0]!;
    expect(slide.children.map((c) => c.verb)).toEqual(['text', 'rect']);
    // physical lines stay addressable: line index = line number
    expect(doc.lines.map((l) => src.slice(l.start).split('\n')[0])).toEqual(src.split('\n'));
    expect(doc.lines[2]!.of).toBe(doc.lines[1]);
    expect(doc.lines[5]!.op?.verb).toBe('rect');
    const t = slide.children[0]!.args[2]!.value;
    expect(t.k === 'str' && t.value).toBe('eins\n  zwei {x}');
  });

  it('reports an unterminated raw string', () => {
    expect(parse('text @t """abc\n').diagnostics[0]?.message).toContain('"""');
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

describe('migrate', () => {
  it('inserts braces for indented blocks and keeps everything else', () => {
    const old = '// Kopf\nslide @a // erste\n  rect @r\n\n  group @g\n    text @t "x"\n    // Ende der Gruppe\n\nslide @b\n';
    const out = migrate(old);
    expect(out).toBe('// Kopf\nslide @a { // erste\n  rect @r\n\n  group @g {\n    text @t "x"\n  }\n}\n    // Ende der Gruppe\n\nslide @b\n');
    expect(parse(out).diagnostics).toEqual([]);
    expect(migrate(out)).toBe(out);
    expect(needsMigration(old)).toBe(true);
    expect(needsMigration(out)).toBe(false);
  });

  it('examples and the built-in theme use braces', () => {
    expect(needsMigration(ex('deck.forme'))).toBe(false);
    expect(needsMigration(DEFAULT_THEME_SOURCE)).toBe(false);
  });
});
