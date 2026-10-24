import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate, parse } from '../src/index.js';
import type { DeckScene, SceneNode } from '../src/index.js';

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
    const s = evalSrc('deck "x"\nslide @a layout=title\n  fill @title "Hallo"\n');
    expect(s.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const t = node(s, 0, 'title');
    expect(t.placeholder).toBe(false);
    expect(t.prov.text!.op.scope).toBe('slide');
    expect(t.prov.x!.op.scope).toBe('layout');
    expect(node(s, 0, 'subtitle').placeholder).toBe(true);
  });

  it('enforces sequential semantics', () => {
    const s = evalSrc('slide @a\n  rect @r x=@q.right\n  rect @q\n');
    expect(s.diagnostics.some((d) => d.message.includes('vor ihrer Verwendung'))).toBe(true);
  });

  it('computes expressions, percentages and tokens', () => {
    const s = evalSrc('slide @a\n  rect @r x=10% y=(slide.h / 2) w=(slide.w - 2*$margin) h=50%\n  rect @q x=@r.right+20 y=@r.center\n');
    const r = node(s, 0, 'r');
    expect(r.box).toEqual({ x: 192, y: 540, w: 1680, h: 540 });
    const q = node(s, 0, 'q');
    expect(q.box.x).toBe(192 + 1680 + 20);
    expect(q.box.y).toBe(540 + 270);
  });

  it('wraps text with fixed width', () => {
    const s = evalSrc('slide @a\n  text @t "Ein ziemlich langer Satz der umbrechen muss" w=300 size=32\n');
    const t = node(s, 0, 't');
    expect(t.text!.lines.length).toBeGreaterThan(1);
    expect(t.box.w).toBe(300);
    expect(t.box.h).toBeCloseTo(t.text!.lines.length * 32 * 1.25);
  });

  it('handles move with relative provenance', () => {
    const s = evalSrc('slide @a\n  rect @r x=100\n  move @r 50 0\n');
    const r = node(s, 0, 'r');
    expect(r.box.x).toBe(150);
    expect(r.prov.x!.relative).toBe(true);
  });

  it('applies stack and grid', () => {
    const s = evalSrc('slide @a\n  rect @a1 x=100 y=100 h=50\n  rect @a2 h=80\n  rect @a3 h=20\n  stack v @a1 @a2 @a3 gap=10\n');
    expect(node(s, 0, 'a2').box.y).toBe(160);
    expect(node(s, 0, 'a3').box.y).toBe(250);
    const g = evalSrc('slide @a\n  rect @a1\n  rect @a2\n  rect @a3\n  grid @a1 @a2 @a3 cols=2 x=0 y=0 w=1000 gap=20\n');
    expect(node(g, 0, 'a2').box).toEqual({ x: 510, y: 0, w: 490, h: 120 });
    expect(node(g, 0, 'a3').box.y).toBe(140);
  });

  it('groups use relative coordinates', () => {
    const s = evalSrc('slide @a\n  group @g x=100 y=100\n    rect @r x=10 y=10 w=50 h=50\n');
    expect(node(s, 0, 'r').box).toEqual({ x: 110, y: 110, w: 50, h: 50 });
    expect(node(s, 0, 'g').box).toEqual({ x: 110, y: 110, w: 50, h: 50 });
  });

  it('references inside groups and components are relative to the container', () => {
    const s = evalSrc('slide @a\n  group @g x=100 y=100\n    rect @r x=10 y=10 w=50 h=50\n    rect @q x=@r.right y=@r.bottom w=10 h=10\n');
    expect(node(s, 0, 'q').box).toEqual({ x: 160, y: 160, w: 10, h: 10 });
    const theme = 'theme "T"\ncomponent card w=200 h=100\n  text @a "A" x=10 y=10 size=20 line=1\n  text @b "B" x=10 y=@a.bottom+5 size=20 line=1\n';
    const c = evalSrc('slide @a\n  use @c card x=500 y=300\n', theme);
    expect(node(c, 0, 'c').children[1]!.box.y).toBe(300 + 10 + 20 + 5);
  });

  it('rejects theme definitions in decks', () => {
    const s = evalSrc('token x 3\nslide @a\n');
    expect(s.diagnostics.some((d) => d.message.includes('Theme-Definition'))).toBe(true);
  });

  it('counts sections', () => {
    const s = evalSrc('section "A"\nslide @a\n  text @t "Teil {section.n} von {deck.sections}"\nsection "B"\nslide @b\n');
    expect(node(s, 0, 't').props.text).toBe('Teil 1 von 2');
  });

  it('numbers hidden slides correctly', () => {
    const s = evalSrc('slide @a\nslide @b hidden=true\nslide @c\n  text @t "{slide.n}/{deck.total}"\n');
    expect(node(s, 2, 't').props.text).toBe('2/2');
  });
});
