import { describe, expect, it } from 'vitest';
import { applyEdits, computeEdit, evaluate, parse } from '../src/index.js';
import type { DeckScene, Intent, SceneNode } from '../src/index.js';

function evalSrc(src: string, theme?: string): DeckScene {
  return evaluate(parse(src), { theme: theme ? parse(theme) : null });
}

function node(scene: DeckScene, id: string, slide = 0): SceneNode {
  const n = scene.slides[slide]!.byId.get(id);
  if (!n) throw new Error(`no node ${id}`);
  return n;
}

const round = (b: { x: number; y: number; w: number; h: number }): number[] => [b.x, b.y, b.w, b.h].map((v) => Math.round(v * 100) / 100);

describe('row / column containers', () => {
  it('shares the free width of a row by span and stretches the height', () => {
    const s = evalSrc('slide @s layout=blank\n  row @r x=100 y=100 w=1000 gap=20 pad=10\n    rect @a\n    rect @b w=200\n    rect @c span=2\n');
    expect(round(node(s, 'a').box)).toEqual([110, 110, 246.67, 120]);
    expect(round(node(s, 'b').box)).toEqual([376.67, 110, 200, 120]);
    expect(round(node(s, 'c').box)).toEqual([596.67, 110, 493.33, 120]);
    expect(round(node(s, 'r').box)).toEqual([100, 100, 1000, 140]);
  });

  it('wraps a 12-column grid like Bootstrap', () => {
    const s = evalSrc('slide @s layout=blank\n  row @r w=1200 cols=12 gap=0\n    rect @a span=6 h=50\n    rect @b span=6 h=80\n    rect @c span=4 h=40\n');
    expect(round(node(s, 'a').box)).toEqual([0, 0, 600, 50]);
    expect(round(node(s, 'b').box)).toEqual([600, 0, 600, 80]);
    expect(round(node(s, 'c').box)).toEqual([0, 80, 400, 40]);
    expect(node(s, 'r').box.h).toBe(120);
  });

  it('stacks a column and lets text wrap to its width', () => {
    const s = evalSrc('slide @s layout=blank\n  column @c x=0 y=0 w=300 gap=10\n    text @t "Ein längerer Text, der umbrechen muss" size=32\n    rect @r h=100\n');
    const t = node(s, 't');
    expect(t.box.w).toBe(300);
    expect(t.text!.lines.length).toBeGreaterThan(1);
    expect(node(s, 'r').box.y).toBeCloseTo(t.box.h + 10);
    expect(node(s, 'c').box.h).toBeCloseTo(t.box.h + 10 + 100);
  });

  it('nests containers', () => {
    const s = evalSrc(
      'slide @s layout=blank\n  row @r x=0 y=0 w=1000 gap=40\n    column @left gap=10\n      rect @a h=50\n      rect @b h=70\n    rect @side w=300\n',
    );
    expect(round(node(s, 'left').box)).toEqual([0, 0, 660, 130]);
    expect(round(node(s, 'a').box)).toEqual([0, 0, 660, 50]);
    expect(round(node(s, 'b').box)).toEqual([0, 60, 660, 70]);
    expect(round(node(s, 'side').box)).toEqual([700, 0, 300, 130]);
  });

  it('fills a region and aligns / justifies', () => {
    const s = evalSrc('slide @s layout=content\n  row @r within=content justify=center align=center gap=20\n    rect @a w=100 h=50\n    rect @b w=100 h=100\n');
    const region = s.slides[0]!.regions.content!;
    expect(node(s, 'r').box).toEqual(region);
    expect(node(s, 'a').box.x).toBeCloseTo(region.x + (region.w - 220) / 2);
    expect(node(s, 'a').box.y).toBeCloseTo(region.y + (region.h - 50) / 2);
  });

  it('reflows when a later op changes a child', () => {
    const s = evalSrc('slide @s layout=blank\n  row @r w=1000\n    rect @a\n    rect @b\n  set @a w=800\n');
    expect(node(s, 'a').box.w).toBe(800);
    expect(node(s, 'b').box).toMatchObject({ x: 800, w: 200 });
  });

  it('rebuilds component instances with the size assigned by the row', () => {
    const theme = 'theme "T"\ncomponent card w=200 h=100 title="x"\n  rect @bg w=param.w h=param.h\n  text @t param.title\n';
    const s = evalSrc('slide @s\n  row @r w=1000 gap=0\n    use @c1 card title="A"\n    use @c2 card title="B"\n  set @c2 title="Neu"\n', theme);
    expect(node(s, 'c1').children[0]!.box.w).toBe(500);
    expect(node(s, 'c2').children[1]!.props.text).toBe('Neu');
  });
});

describe('editing containers', () => {
  function run(src: string, intent: Intent): string {
    const deck = parse(src);
    const scene = evaluate(deck);
    const res = computeEdit({ deck, theme: null, scene, mode: 'deck' }, intent);
    if (res.error) throw new Error(res.error);
    return applyEdits(src, res.edits).text;
  }

  const src = 'slide @s layout=blank\n  row @r w=1000\n    rect @a\n    rect @b\n    rect @c\n';

  it('resizing a child writes its own width and the row reflows', () => {
    const out = run(src, { type: 'resize', slide: 's', id: 'b', box: { x: 333.33, y: 0, w: 400, h: 120 }, height: false });
    expect(out).toBe('slide @s layout=blank\n  row @r w=1000\n    rect @a\n    rect @b w=400\n    rect @c\n');
    const s = evalSrc(out);
    expect(node(s, 'a').box.w).toBe(300);
  });

  it('moving a child does not write positions (flow owns them)', () => {
    const deck = parse(src);
    const res = computeEdit({ deck, theme: null, scene: evaluate(deck), mode: 'deck' }, { type: 'move', slide: 's', ids: ['b'], dx: 50, dy: 0 });
    expect(res.edits).toEqual([]);
  });

  it('reorders children by moving their lines', () => {
    expect(run(src, { type: 'reorder', slide: 's', id: 'c', index: 0 })).toBe('slide @s layout=blank\n  row @r w=1000\n    rect @c\n    rect @a\n    rect @b\n');
    expect(run(src, { type: 'reorder', slide: 's', id: 'a', index: 2 })).toBe('slide @s layout=blank\n  row @r w=1000\n    rect @b\n    rect @c\n    rect @a\n');
  });
});
