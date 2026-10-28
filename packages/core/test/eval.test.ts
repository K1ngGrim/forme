import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate, highlightCode, parse } from '../src/index.js';
import type { DeckScene, MathRenderer, SceneNode } from '../src/index.js';

const ex = (p: string): string => readFileSync(resolve(__dirname, '../../../examples', p), 'utf8');

function evalSrc(src: string, theme?: string): DeckScene {
  return evaluate(parse(src), { theme: theme ? parse(theme) : null });
}

function node(scene: DeckScene, slide: number, id: string): SceneNode {
  const n = scene.slides[slide]!.byId.get(id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

describe('evaluator', () => {
  it('evaluates the example deck without errors', () => {
    const scene = evaluate(parse(ex('deck.forme')), { theme: parse(ex('themes/corporate.forme')) });
    expect(scene.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(scene.slides.length).toBe(3);
    expect(scene.title).toBe('Quartalsbericht Q3');
    // distribute within content region, then align top
    const [c1, c2, c3] = ['card1', 'card2', 'card3'].map((id) => node(scene, 1, id));
    expect(c1!.box.x).toBe(120);
    expect(c3!.box.x + c3!.box.w).toBe(1800);
    expect(c2!.box.x - (c1!.box.x + c1!.box.w)).toBeCloseTo(c3!.box.x - (c2!.box.x + c2!.box.w));
    expect(c2!.box.y).toBe(260);
    // provenance: card2.x written by the distribute op (semantic)
    expect(c2!.prov.x!.semantic).toBe(true);
    expect(c1!.prov.w!.literal).toBe(true);
    // caption numbering
    expect(node(scene, 1, 'chart_caption').props.text).toBe('Abb. 1: Umsatz nach Region');
    expect(scene.slides[1]!.notes).toBe('Wachstum im Süden betonen.');
    // master page number hidden on title layout
    expect(node(scene, 0, 'pagenum').props.hidden).toBe(true);
    expect(node(scene, 1, 'pagenum').props.text).toBe('2');
    expect(node(scene, 2, 'title').props.text).toBe('Details – Zahlen');
    // component instance
    const k1 = node(scene, 2, 'k1');
    expect(k1.component).toBe('kpi');
    expect(k1.children.length).toBe(3);
  });

  it('uses the built-in theme by default', () => {
    const s = evalSrc('deck "x"\nslide @a layout=title {\n  fill @title "Hallo"\n}\n');
    expect(s.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const t = node(s, 0, 'title');
    expect(t.placeholder).toBe(false);
    expect(t.prov.text!.op.scope).toBe('slide');
    expect(t.prov.x!.op.scope).toBe('layout');
    expect(node(s, 0, 'subtitle').placeholder).toBe(true);
  });

  it('enforces sequential semantics', () => {
    const s = evalSrc('slide @a {\n  rect @r x=@q.right\n  rect @q\n}\n');
    expect(s.diagnostics.some((d) => d.message.includes('vor ihrer Verwendung'))).toBe(true);
  });

  it('computes expressions, percentages and tokens', () => {
    const s = evalSrc('slide @a {\n  rect @r x=10% y=(slide.h / 2) w=(slide.w - 2*$margin) h=50%\n  rect @q x=@r.right+20 y=@r.center\n}\n');
    const r = node(s, 0, 'r');
    expect(r.box).toEqual({ x: 192, y: 540, w: 1680, h: 540 });
    const q = node(s, 0, 'q');
    expect(q.box.x).toBe(192 + 1680 + 20);
    expect(q.box.y).toBe(540 + 270);
  });

  it('wraps text with fixed width', () => {
    const s = evalSrc('slide @a {\n  text @t "Ein ziemlich langer Satz der umbrechen muss" w=300 size=32\n}\n');
    const t = node(s, 0, 't');
    expect(t.text!.lines.length).toBeGreaterThan(1);
    expect(t.box.w).toBe(300);
    expect(t.box.h).toBeCloseTo(t.text!.lines.length * 32 * 1.25);
  });

  it('handles move with relative provenance', () => {
    const s = evalSrc('slide @a {\n  rect @r x=100\n  move @r 50 0\n}\n');
    const r = node(s, 0, 'r');
    expect(r.box.x).toBe(150);
    expect(r.prov.x!.relative).toBe(true);
  });

  it('applies stack and grid', () => {
    const s = evalSrc('slide @a {\n  rect @a1 x=100 y=100 h=50\n  rect @a2 h=80\n  rect @a3 h=20\n  stack v @a1 @a2 @a3 gap=10\n}\n');
    expect(node(s, 0, 'a2').box.y).toBe(160);
    expect(node(s, 0, 'a3').box.y).toBe(250);
    const g = evalSrc('slide @a {\n  rect @a1\n  rect @a2\n  rect @a3\n  grid @a1 @a2 @a3 cols=2 x=0 y=0 w=1000 gap=20\n}\n');
    expect(node(g, 0, 'a2').box).toEqual({ x: 510, y: 0, w: 490, h: 120 });
    expect(node(g, 0, 'a3').box.y).toBe(140);
  });

  it('groups use relative coordinates', () => {
    const s = evalSrc('slide @a {\n  group @g x=100 y=100 {\n    rect @r x=10 y=10 w=50 h=50\n  }\n}\n');
    expect(node(s, 0, 'r').box).toEqual({ x: 110, y: 110, w: 50, h: 50 });
    expect(node(s, 0, 'g').box).toEqual({ x: 110, y: 110, w: 50, h: 50 });
  });

  it('references inside groups and components are relative to the container', () => {
    const s = evalSrc('slide @a {\n  group @g x=100 y=100 {\n    rect @r x=10 y=10 w=50 h=50\n    rect @q x=@r.right y=@r.bottom w=10 h=10\n  }\n}\n');
    expect(node(s, 0, 'q').box).toEqual({ x: 160, y: 160, w: 10, h: 10 });
    const theme = 'theme "T"\ncomponent card w=200 h=100 {\n  text @a "A" x=10 y=10 size=20 line=1\n  text @b "B" x=10 y=@a.bottom+5 size=20 line=1\n}\n';
    const c = evalSrc('slide @a {\n  use @c card x=500 y=300\n}\n', theme);
    expect(node(c, 0, 'c').children[1]!.box.y).toBe(300 + 10 + 20 + 5);
  });

  it('copies component instances with like=', () => {
    const theme = 'theme "T"\ncomponent card w=200 h=100 title="x" {\n  text @t param.title\n}\n';
    const s = evalSrc('slide @a {\n  use @c1 card x=10 y=20 w=300 title="Eins"\n  use @c2 card like=@c1 title="Zwei"\n}\n', theme);
    const c2 = node(s, 0, 'c2');
    expect(c2.box).toEqual({ x: 10, y: 20, w: 300, h: 100 });
    expect(c2.children[0]!.props.text).toBe('Zwei');
    expect(c2.prov.x!.inherited).toBe(true);
  });

  it('rejects theme definitions in decks', () => {
    const s = evalSrc('token x 3\nslide @a\n');
    expect(s.diagnostics.some((d) => d.message.includes('Theme-Definition'))).toBe(true);
  });

  it('counts sections', () => {
    const s = evalSrc('section "A"\nslide @a {\n  text @t "Teil {section.n} von {deck.sections}"\n}\nsection "B"\nslide @b\n');
    expect(node(s, 0, 't').props.text).toBe('Teil 1 von 2');
  });

  it('numbers hidden slides correctly', () => {
    const s = evalSrc('slide @a\nslide @b hidden=true\nslide @c {\n  text @t "{slide.n}/{deck.total}"\n}\n');
    expect(node(s, 2, 't').props.text).toBe('2/2');
  });
});

describe('box', () => {
  const b = (src: string): DeckScene => evalSrc(`slide @a {\n${src}\n}\n`);

  it('places children relative to its padded inner area and fits its content', () => {
    const s = b('box @k x=100 y=200 w=800 pad=40 fill=#eee {\n  rect @r x=10 y=20 w=100 h=60\n  rect @p x=50% y=100 w=25% h=10\n}');
    expect(node(s, 0, 'r').box).toEqual({ x: 150, y: 260, w: 100, h: 60 });
    expect(node(s, 0, 'p').box).toEqual({ x: 500, y: 340, w: 180, h: 10 });
    // no h: content (110) plus padding
    expect(node(s, 0, 'k').box).toEqual({ x: 100, y: 200, w: 800, h: 190 });
    expect(s.diagnostics).toEqual([]);
  });

  it('moves its children along and follows set', () => {
    const s = b('box @k x=0 y=0 w=400 h=300 pad=20 {\n  rect @r w=box.w h=box.cy\n}\nmove @k dx=100 dy=50\nset @k pad=0 w=600');
    expect(node(s, 0, 'r').box).toEqual({ x: 100, y: 50, w: 600, h: 150 });
  });

  it('gets its size from a row and evaluates its body again', () => {
    const s = b('row @z x=0 y=0 w=1000 h=400 gap=0 {\n  box @k pad=50 {\n    rect @r w=box.w h=50%\n  }\n  rect @q\n}');
    expect(node(s, 0, 'k').box).toEqual({ x: 0, y: 0, w: 500, h: 400 });
    expect(node(s, 0, 'r').box).toEqual({ x: 50, y: 50, w: 400, h: 150 });
    // the first pass did not know the width yet: its errors are gone
    expect(s.diagnostics).toEqual([]);
  });

  it('reports box.w without a fixed width and box outside of boxes', () => {
    const s = b('box @k {\n  rect @r w=box.w\n}\nrect @q w=box.w');
    expect(s.diagnostics.map((d) => d.message)).toEqual(['Die Box hat keine feste Breite', '„box“ ist nur innerhalb einer Box verfügbar']);
  });
});

describe('code', () => {
  it('highlights Python, Java and SQL', () => {
    const cls = (src: string, lang: string): string =>
      highlightCode(src, lang)
        .filter((t) => t.cls !== 'plain')
        .map((t) => `${t.cls}:${t.text}`)
        .join(' ');
    expect(cls('def f(x):  # hi\n    return "a"', 'python')).toBe('keyword:def function:f comment:# hi keyword:return string:"a"');
    expect(cls('@Override public int n = 0x1F;', 'java')).toBe('meta:@Override keyword:public type:int number:0x1F');
    expect(cls("select name from t where a = 'x' -- c", 'sql')).toBe("keyword:select keyword:from keyword:where string:'x' comment:-- c");
    expect(highlightCode('a b', 'brainfuck')).toEqual([{ text: 'a b', cls: 'plain' }]);
  });

  it('lays out monospaced, keeps indentation, colors runs and numbers lines', () => {
    const s = evalSrc('slide @a {\n  code @c lang=python x=100 y=100 numbers=true """\n    if x:\n        y = 1\n  """\n}\n');
    const c = node(s, 0, 'c');
    expect(s.diagnostics).toEqual([]);
    expect(c.kind).toBe('text');
    expect(c.props.text).toBe('if x:\n    y = 1');
    const lines = c.text!.lines.map((l) => l.runs.map((r) => r.text).join(''));
    expect(lines).toEqual(['1  if x:', '2      y = 1']);
    // 0.6 em per character at size 28, plus padding 32 on both sides
    expect(c.box.w).toBeCloseTo(12 * 0.6 * 28 + 64);
    expect(c.runs!.find((r) => r.text === 'if')?.color).toBe('#CF222E');
    expect(c.props.fill).toBe('#F6F8FA');
  });

  it('dark palette, theme colors and unknown languages', () => {
    const s = evalSrc('slide @a {\n  code @c "return 1" lang=java palette=dark\n  code @d "x" lang=cobol\n}\n', 'theme "T"\ncolor code.keyword #FF0000\n');
    expect(node(s, 0, 'c').props.fill).toBe('#282C34');
    expect(node(s, 0, 'c').runs!.find((r) => r.text === 'return')?.color).toBe('#FF0000');
    expect(s.diagnostics.map((d) => d.message)).toEqual(['Unbekannte Sprache „cobol“ – ohne Hervorhebung']);
  });
});

describe('math', () => {
  const fake: MathRenderer = (tex) => (tex.includes('{') && !tex.includes('}') ? { body: '', viewBox: '0 0 0 0', w: 0, h: 0, error: 'Missing close brace' } : { body: '<path/>', viewBox: '0 -750 2000 1000', w: 2, h: 1 });

  it('sizes formulas from the renderer, scales into a given box, reports errors', () => {
    const s = evaluate(parse('slide @a {\n  math @f x=10 y=20 size=50 """\\frac{a}{b}"""\n  math @g w=300 h=100 """x"""\n  math @e """\\frac{a"""\n}\n'), { math: fake });
    expect(node(s, 0, 'f').box).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    expect(node(s, 0, 'f').math?.viewBox).toBe('0 -750 2000 1000');
    expect(node(s, 0, 'f').props.text).toBe('\\frac{a}{b}');
    expect(node(s, 0, 'g').box).toEqual({ x: 0, y: 0, w: 300, h: 100 });
    expect(s.diagnostics.map((d) => d.message)).toEqual(['Formel: Missing close brace']);
  });

  it('warns about formulas in normal strings and estimates a size without renderer', () => {
    const s = evalSrc('slide @a {\n  math @f "\\\\alpha"\n}\n');
    expect(s.diagnostics[0]?.message).toContain('Rohtext');
    expect(node(s, 0, 'f').math).toBeNull();
    expect(node(s, 0, 'f').box.w).toBeGreaterThan(0);
  });
});

describe('include', () => {
  const backup = 'deck "Backup"\ntheme "../theme.forme"\n\nsection "Backup"\nslide @b1 {\n  rect @r x=10 fill=$primary\n  image @i "../img/a.png"\n  image @j "bild.png"\n}\nslide @b2 {\n  text @t "Abschnitt {section}, Folie {slide.n} von {deck.total}"\n}\n';
  const deck = 'deck "Haupt"\n\nslide @a {\n  rect @x\n}\n\ninclude "./kapitel/backup.forme"\n\nslide @z\n';

  it('puts the slides of another file at the position of include, with the deck theme', () => {
    const s = evaluate(parse(deck), { includes: { './kapitel/backup.forme': parse(backup) } });
    expect(s.diagnostics).toEqual([]);
    expect(s.slides.map((x) => x.id)).toEqual(['a', 'b1', 'b2', 'z']);
    expect(node(s, 1, 'r').props.fill).toBe('#2563EB');
    expect(node(s, 2, 't').props.text).toBe('Abschnitt Backup, Folie 3 von 4');
    expect(s.slides[1]!.op).toMatchObject({ file: 'include', path: './kapitel/backup.forme' });
    expect(node(s, 1, 'r').origin).toMatchObject({ file: 'include', path: './kapitel/backup.forme' });
    // image paths of the included file are relative to it, rebased onto the deck
    expect(node(s, 1, 'i').props.src).toBe('img/a.png');
    expect(node(s, 1, 'j').props.src).toBe('kapitel/bild.png');
  });

  it('reports missing files and errors in the included file with its path', () => {
    const missing = evaluate(parse(deck));
    expect(missing.diagnostics.map((d) => d.message)).toEqual(['Datei „./kapitel/backup.forme“ nicht gefunden']);
    const broken = evaluate(parse(deck), { includes: { './kapitel/backup.forme': parse('slide @b1 {\n  rect @r like=@nope\n}\ninclude "x.forme"\n') } });
    expect(broken.diagnostics.map((d) => [d.file, d.path, d.message])).toEqual([
      ['include', './kapitel/backup.forme', '„include“ in einer eingebundenen Datei wird nicht unterstützt'],
      ['include', './kapitel/backup.forme', 'Unbekanntes Objekt „@nope“'],
    ]);
    expect(broken.slides[1]!.hasErrors).toBe(true);
  });
});
