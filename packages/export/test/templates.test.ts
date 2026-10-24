import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSlideSvg } from '@forme/render';
import { exportPptx, loadDeck } from '../src/index.js';

const examples = resolve(__dirname, '../../../examples');

describe.each(['hka-seminar', 'hka-projektarbeit'])('template %s', (name) => {
  it('evaluates without errors, with real font metrics', async () => {
    const loaded = await loadDeck(resolve(examples, name, 'deck.forme'));
    expect(loaded.scene.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(loaded.scene.theme.fonts.every((f) => !f.file || f.file.endsWith('.woff'))).toBe(true);
  });

  it('matches the golden SVGs', async () => {
    const loaded = await loadDeck(resolve(examples, name, 'deck.forme'));
    for (const slide of loaded.scene.slides) {
      const svg = renderSlideSvg(loaded.scene, slide).replace(/></g, '>\n<');
      await expect(svg).toMatchFileSnapshot(resolve(examples, '__golden__', `${name}.${slide.id}.svg`));
    }
  });

  it('exports to PPTX', async () => {
    const loaded = await loadDeck(resolve(examples, name, 'deck.forme'));
    const res = await exportPptx(loaded.scene, {
      loadAsset: async (p) => {
        try {
          return new Uint8Array(await readFile(loaded.resolvePath(p)));
        } catch {
          return null;
        }
      },
    });
    expect(res.data.byteLength).toBeGreaterThan(10_000);
  });
});
