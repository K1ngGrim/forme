import { describe, expect, it } from 'vitest';
import { applyEdits, computeEdit, evaluate, parse } from '../src/index.js';
import type { Intent } from '../src/index.js';

function run(src: string, intent: Intent, mode: 'deck' | 'theme' = 'deck', theme?: string): string {
  const deck = parse(src);
  const themeDoc = theme ? parse(theme) : null;
  const scene = evaluate(deck, { theme: themeDoc });
  const res = computeEdit(
    { deck, theme: themeDoc, scene, mode, evaluate: (s) => evaluate(parse(s), { theme: themeDoc }) },
    intent,
  );
  if (res.error) throw new Error(res.error);
  const base = res.file === 'theme' ? (theme as string) : src;
  return applyEdits(base, res.edits).text;
}

describe('edit engine', () => {
  it('rule 1: replaces literals on the current slide', () => {
    const src = 'slide @a {\n  rect @r x=100 y=50 // box\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['r'], dx: 20, dy: -10 })).toBe('slide @a {\n  rect @r x=120 y=40 // box\n}\n');
  });

  it('appends missing props to the creation op', () => {
    const src = 'slide @a {\n  rect @r w=10\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['r'], dx: 5, dy: 0 })).toBe('slide @a {\n  rect @r w=10 x=5\n}\n');
  });

  it('keeps percentage units', () => {
    const src = 'slide @a {\n  rect @r x=10%\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['r'], dx: 192, dy: 0 })).toBe('slide @a {\n  rect @r x=20% y=0\n}\n'.replace(' y=0', ''));
  });

  it('rule 2: expressions get a set line after the writer', () => {
    const src = 'slide @a {\n  rect @r x=(slide.w / 2)\n  rect @q\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['r'], dx: 10, dy: 0 })).toBe('slide @a {\n  rect @r x=(slide.w / 2)\n  set @r x=970\n  rect @q\n}\n');
  });

  it('rule 2: updates an existing set line', () => {
    const src = 'slide @a {\n  rect @r x=(slide.w / 2)\n  set @r x=970\n}\n';
    // last writer is now the literal in the set line -> rule 1
    expect(run(src, { type: 'move', slide: 'a', ids: ['r'], dx: 10, dy: 0 })).toBe('slide @a {\n  rect @r x=(slide.w / 2)\n  set @r x=980\n}\n');
  });

  it('rule 2: semantic ops get overridden', () => {
    const src = 'slide @a {\n  rect @r x=0\n  rect @q x=500\n  align left @r @q\n  text @t "x"\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['q'], dx: 30, dy: 0 })).toBe(
      'slide @a {\n  rect @r x=0\n  rect @q x=500\n  align left @r @q\n  set @q x=30\n  text @t "x"\n}\n',
    );
  });

  it('rule 2: overrides go after the last op targeting the object', () => {
    const src = 'slide @a {\n  rect @r x=(1+1) y=0\n  rect @q y=0\n  align top @r @q\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['r'], dx: 5, dy: 0 })).toBe('slide @a {\n  rect @r x=(1+1) y=0\n  rect @q y=0\n  align top @r @q\n  set @r x=7\n}\n');
  });

  it('rule 2: layout objects are overridden after the ops touching them', () => {
    const src = 'slide @a layout=content {\n  fill @title "Hallo"\n  rect @r\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['title'], dx: 0, dy: 10 })).toBe(
      'slide @a layout=content {\n  fill @title "Hallo"\n  set @title y=130\n  rect @r\n}\n',
    );
    // untouched layout objects: at the top of the slide
    expect(run('slide @a layout=content {\n  rect @r\n}\n', { type: 'move', slide: 'a', ids: ['pagenum'], dx: 0, dy: -10 })).toBe(
      'slide @a layout=content {\n  set @pagenum y=990\n  rect @r\n}\n',
    );
  });

  it('rule 3: theme objects are never changed from a slide', () => {
    const src = 'slide @a layout=content {\n  fill @title "Hallo"\n}\n';
    const out = run(src, { type: 'setProps', slide: 'a', id: 'title', props: { color: { color: '#FF0000' } } });
    expect(out).toContain('set @title color=#FF0000');
  });

  it('theme mode edits literals in the theme file', () => {
    const theme = 'theme "T"\nlayout content {\n  slot @title x=120 y=100\n}\n';
    const out = run('slide @a layout=content\n', { type: 'move', slide: 'a', ids: ['title'], dx: 10, dy: 0 }, 'theme', theme);
    expect(out).toBe('theme "T"\nlayout content {\n  slot @title x=130 y=100\n}\n');
  });

  it('theme mode overrides expressions inside the layout block', () => {
    const theme = 'theme "T"\ntoken m 100\nlayout content {\n  slot @title x=$m y=100\n  region content\n}\n';
    const out = run('slide @a layout=content\n', { type: 'move', slide: 'a', ids: ['title'], dx: 10, dy: 0 }, 'theme', theme);
    expect(out).toBe('theme "T"\ntoken m 100\nlayout content {\n  slot @title x=$m y=100\n  set @title x=110\n  region content\n}\n');
  });

  it('move ops adjust their relative amount', () => {
    const src = 'slide @a {\n  rect @r x=(1+1)\n  move @r 50 0\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['r'], dx: 10, dy: 0 })).toBe('slide @a {\n  rect @r x=(1+1)\n  move @r 60 0\n}\n');
  });

  it('like= copies are not written back to the source object', () => {
    const src = 'slide @a {\n  rect @c1 x=10 w=50\n  rect @c2 like=@c1\n}\n';
    expect(run(src, { type: 'move', slide: 'a', ids: ['c2'], dx: 5, dy: 0 })).toBe('slide @a {\n  rect @c1 x=10 w=50\n  rect @c2 like=@c1\n  set @c2 x=15\n}\n');
  });

  it('resizes with anchors', () => {
    const src = 'slide @a {\n  rect @r x=100 y=100 w=200 h=100\n}\n';
    expect(run(src, { type: 'resize', slide: 'a', id: 'r', box: { x: 90, y: 100, w: 210, h: 150 }, height: true })).toBe(
      'slide @a {\n  rect @r x=90 y=100 w=210 h=150\n}\n',
    );
  });

  it('rounds all corners with one literal', () => {
    const src = 'slide @a {\n  rect @r radius=4\n}\n';
    expect(run(src, { type: 'setProps', slide: 'a', id: 'r', props: { radius: 24 } })).toBe('slide @a {\n  rect @r radius=24\n}\n');
    expect(run('slide @a {\n  rect @r\n}\n', { type: 'setProps', slide: 'a', id: 'r', props: { radius: 8 } })).toBe('slide @a {\n  rect @r radius=8\n}\n');
  });

  it('edits text and fills slots', () => {
    expect(run('slide @a {\n  text @t "Alt"\n}\n', { type: 'text', slide: 'a', id: 't', text: 'Neu "zitiert"' })).toBe('slide @a {\n  text @t "Neu \\"zitiert\\""\n}\n');
    expect(run('slide @a layout=title {\n  fill @title "T"\n}\n', { type: 'text', slide: 'a', id: 'subtitle', text: 'Sub' })).toBe(
      'slide @a layout=title {\n  fill @subtitle "Sub"\n  fill @title "T"\n}\n',
    );
  });

  it('creates objects with fresh ids at the end of the slide', () => {
    const src = 'slide @a {\n  rect @rect1\n}\nslide @b\n';
    expect(run(src, { type: 'create', slide: 'a', kind: 'rect', props: { x: 1, y: 2, w: 3, h: 4 } })).toBe(
      'slide @a {\n  rect @rect1\n  rect @rect2 x=1 y=2 w=3 h=4\n}\nslide @b\n',
    );
  });

  it('deletes objects and strips references', () => {
    const src = 'slide @a {\n  rect @r1\n  rect @r2\n  rect @r3\n  align top @r1 @r2 @r3\n  hide @r2\n}\n';
    expect(run(src, { type: 'delete', slide: 'a', ids: ['r2'] })).toBe('slide @a {\n  rect @r1\n  rect @r3\n  align top @r1 @r3\n}\n');
  });

  it('warns before deleting referenced objects', () => {
    const src = 'slide @a {\n  rect @r1\n  rect @r2 x=@r1.right\n}\n';
    const deck = parse(src);
    const scene = evaluate(deck);
    const res = computeEdit({ deck, theme: null, scene, mode: 'deck' }, { type: 'delete', slide: 'a', ids: ['r1'] });
    expect(res.error).toBeTruthy();
    expect(res.warnings.length).toBe(1);
  });

  it('deleting master objects hides them', () => {
    const src = 'slide @a layout=content {\n  fill @title "T"\n}\n';
    expect(run(src, { type: 'delete', slide: 'a', ids: ['pagenum'] })).toBe('slide @a layout=content {\n  hide @pagenum\n  fill @title "T"\n}\n');
  });

  it('renames ids everywhere', () => {
    const src = 'slide @a {\n  rect @r1\n  rect @r2 x=@r1.right like=@r1\n}\n';
    expect(run(src, { type: 'rename', from: 'r1', to: 'box' })).toBe('slide @a {\n  rect @box\n  rect @r2 x=@box.right like=@box\n}\n');
  });

  it('toolbar arrange appends semantic ops or bakes literals', () => {
    const src = 'slide @a {\n  rect @r1 x=10\n  rect @r2 x=300\n}\n';
    expect(run(src, { type: 'arrange', slide: 'a', verb: 'align', mode: 'left', ids: ['r1', 'r2'], bake: false })).toBe('slide @a {\n  rect @r1 x=10\n  rect @r2 x=300\n  align left @r1 @r2\n}\n');
    expect(run(src, { type: 'arrange', slide: 'a', verb: 'align', mode: 'left', ids: ['r1', 'r2'], bake: true })).toBe('slide @a {\n  rect @r1 x=10\n  rect @r2 x=10\n}\n');
  });

  it('command line appends to the slide', () => {
    expect(run('slide @a {\n  rect @r\n}\n\nslide @b\n', { type: 'command', slide: 'a', text: 'ellipse @e x=5' })).toBe('slide @a {\n  rect @r\n  ellipse @e x=5\n}\n\nslide @b\n');
  });

  it('opens a block when a slide has none yet', () => {
    expect(run('slide @a\nslide @b\n', { type: 'command', slide: 'a', text: 'rect @r' })).toBe('slide @a {\n  rect @r\n}\nslide @b\n');
    expect(run('slide @a // leer\n', { type: 'command', slide: 'a', text: 'rect @r' })).toBe('slide @a { // leer\n  rect @r\n}\n');
    expect(run('slide @a {}\n', { type: 'command', slide: 'a', text: 'rect @r' })).toBe('slide @a {\n  rect @r\n}\n');
  });

  it('adds, moves and deletes slides', () => {
    const src = 'deck "x"\n\nslide @a {\n  rect @r\n}\n\nslide @b\n';
    expect(run(src, { type: 'addSlide', after: 'a', layout: 'blank' })).toBe('deck "x"\n\nslide @a {\n  rect @r\n}\n\nslide @s1 layout=blank\n\nslide @b\n');
    expect(run(src, { type: 'moveSlide', slide: 'b', to: 0 })).toBe('deck "x"\n\nslide @b\n\nslide @a {\n  rect @r\n}\n');
    expect(run(src, { type: 'deleteSlide', slide: 'b' })).toBe('deck "x"\n\nslide @a {\n  rect @r\n}\n');
    expect(run(src, { type: 'moveSlide', slide: 'a', to: 1 })).toBe('deck "x"\n\nslide @b\n\nslide @a {\n  rect @r\n}\n');
  });

  it('duplicates objects with offset', () => {
    const src = 'slide @a {\n  rect @rect1 x=10 y=10 fill=#fff\n}\n';
    expect(run(src, { type: 'duplicate', slide: 'a', ids: ['rect1'] })).toBe('slide @a {\n  rect @rect1 x=10 y=10 fill=#fff\n  rect @rect2 x=34 y=34 fill=#fff\n}\n');
  });

  it('applyEdits inverse restores the original', () => {
    const src = 'abcdef';
    const { text, inverse } = applyEdits(src, [{ from: 1, to: 2, insert: 'XY' }, { from: 4, to: 4, insert: '!' }]);
    expect(text).toBe('aXYcd!ef');
    expect(applyEdits(text, inverse).text).toBe(src);
  });
});
