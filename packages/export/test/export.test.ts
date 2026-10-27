import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportPptx, pathToPoints, toColor } from '../src/index.js';
import { loadDeck } from '../src/node.js';
import { readFile } from 'node:fs/promises';

describe('pptx export', () => {
  it('converts colors', () => {
    expect(toColor('#1e40af')).toEqual({ hex: '1E40AF', transparency: 0 });
    expect(toColor('#fff')).toEqual({ hex: 'FFFFFF', transparency: 0 });
    expect(toColor('rgba(0,0,0,0.25)')).toEqual({ hex: '000000', transparency: 75 });
    expect(toColor('none')).toBeNull();
  });

  it('maps path data to custom geometry', () => {
    const pts = pathToPoints('M0 0 L96 0 l0 96 Z', { x: 0, y: 0 }, 1, 1);
    expect(pts).toEqual([{ x: 0, y: 0, moveTo: true }, { x: 1, y: 0 }, { x: 1, y: 1 }, { close: true }]);
    expect(pathToPoints('M0 0 A 5 5 0 0 1 10 10', { x: 0, y: 0 }, 1, 1)).toBeNull();
  });

  it('exports the example deck with masters, placeholders and notes', async () => {
    const loaded = await loadDeck(resolve(__dirname, '../../../examples/deck.forme'));
    const res = await exportPptx(loaded.scene, {
      loadAsset: async (p) => {
        try {
          return new Uint8Array(await readFile(loaded.resolvePath(p)));
        } catch {
          return null;
        }
      },
    });
    const text = Buffer.from(res.data).toString('latin1');
    expect(text.startsWith('PK')).toBe(true);
    expect(text).toContain('ppt/notesSlides/notesSlide2.xml');
    expect(text).toContain('ppt/slideLayouts/slideLayout3.xml');
    expect(res.log.some((l) => l.message.includes('Eckenradius'))).toBe(true);
  });
});
