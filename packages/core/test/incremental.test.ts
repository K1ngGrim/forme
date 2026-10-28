import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyEdits, createEvalCache, evaluate, parse } from '../src/index.js';
import type { DeckScene } from '../src/index.js';

const ex = (p: string): string => readFileSync(resolve(__dirname, '../../../examples', p), 'utf8');

function serialize(scene: DeckScene): string {
  return JSON.stringify(scene, (_k, v: unknown) => (v instanceof Map ? [...v.entries()].sort() : v));
}

describe('incremental evaluation', () => {
  const theme = parse(ex('themes/corporate.forme'));
  const base = ex('deck.forme');

  it('reuses unchanged slides and matches a full evaluation', () => {
    const cache = createEvalCache();
    evaluate(parse(base), { theme, cache });
    const edits = [
      // edit in the last slide only
      (s: string) => s.replace('w=700 size=24', 'w=720 size=24'),
      // insert lines above everything (shifts all spans)
      (s: string) => s.replace('theme "./themes/corporate.forme"\n', 'theme "./themes/corporate.forme"\n// Kommentar\n\n'),
      // change in the first slide that affects nothing else
      (s: string) => s.replace('"Vertrieb & Marketing"', '"Vertrieb und Marketing"'),
      // syntax error inside slide 2
      (s: string) => s.replace('notes "Wachstum', 'notes ("Wachstum'),
    ];
    let src = base;
    const reused: number[] = [];
    for (const edit of edits) {
      src = edit(src);
      const inc = evaluate(parse(src), { theme, cache });
      reused.push(cache.reused);
      const full = evaluate(parse(src), { theme });
      expect(serialize(inc)).toBe(serialize(full));
    }
    expect(reused).toEqual([2, 3, 2, 2]);
  });

  it('re-evaluates following slides when counters change', () => {
    const cache = createEvalCache();
    const src = 'slide @a {\n  rect @r\n  number figure @r caption="Abb. {figure}"\n}\nslide @b {\n  rect @q\n  number figure @q caption="Abb. {figure}"\n}\n';
    evaluate(parse(src), { cache });
    const next = applyEdits(src, [{ from: src.indexOf('  number figure @r'), to: src.indexOf('}\nslide @b'), insert: '' }]).text;
    const scene = evaluate(parse(next), { cache });
    expect(scene.slides[1]!.byId.get('q_caption')!.props.text).toBe('Abb. 1');
  });
});
