import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFontMeasurer } from '../src/index.js';

const font = (p: string): ArrayBuffer => {
  const b = readFileSync(resolve(__dirname, '../../../examples', p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('font measurer', () => {
  it('measures fonts whose GSUB tables opentype.js cannot shape (Roboto)', () => {
    const m = createFontMeasurer([{ family: 'Roboto', weight: 400, italic: false, data: font('hka-projektarbeit/fonts/roboto-latin-400-normal.woff') }]);
    const spec = { family: 'Roboto', size: 100, weight: 400, italic: false };
    expect(m.width('Übertragungen', spec)).toBeGreaterThan(500);
    expect(m.width('fi', spec)).toBeGreaterThan(0);
  });

  it('picks the closest weight and style', () => {
    const m = createFontMeasurer([
      { family: 'Inter', weight: 400, italic: false, data: font('hka-seminar/fonts/inter-latin-400-normal.woff') },
      { family: 'Inter', weight: 700, italic: false, data: font('hka-seminar/fonts/inter-latin-700-normal.woff') },
    ]);
    const regular = m.width('Hallo', { family: 'Inter', size: 100, weight: 400, italic: false });
    const bold = m.width('Hallo', { family: 'Inter', size: 100, weight: 700, italic: false });
    expect(bold).toBeGreaterThan(regular);
  });
});
