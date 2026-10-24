import type { FontSpec, TextMeasurer } from '@forme/core';
import { createMetricMeasurer } from '@forme/core';
import opentype from 'opentype.js';

export interface LoadedFont {
  family: string;
  weight: number;
  italic: boolean;
  data: ArrayBuffer;
}

interface Entry {
  family: string;
  weight: number;
  italic: boolean;
  font: opentype.Font;
}

/**
 * Measurer based on real font files (theme `font ... file=`). Falls back to the
 * deterministic metric measurer for families without a loaded file, so editor,
 * CLI and PDF export lay text out identically.
 */
export function createFontMeasurer(fonts: LoadedFont[]): TextMeasurer {
  const fallback = createMetricMeasurer();
  const entries: Entry[] = [];
  for (const f of fonts) {
    try {
      entries.push({ family: f.family.toLowerCase(), weight: f.weight, italic: f.italic, font: opentype.parse(f.data) });
    } catch {
      // unreadable font: ignore, fallback metrics are used
    }
  }
  const cache = new Map<string, number>();
  const pick = (spec: FontSpec): Entry | undefined => {
    const fam = spec.family.toLowerCase();
    const candidates = entries.filter((e) => e.family === fam);
    if (!candidates.length) return undefined;
    return candidates
      .slice()
      .sort((a, b) => Math.abs(a.weight - spec.weight) + (a.italic !== spec.italic ? 1000 : 0) - (Math.abs(b.weight - spec.weight) + (b.italic !== spec.italic ? 1000 : 0)))[0];
  };
  return {
    width(text, spec) {
      const e = pick(spec);
      if (!e) return fallback.width(text, spec);
      const key = `${e.family}|${e.weight}|${e.italic}|${text}`;
      let w = cache.get(key);
      if (w === undefined) {
        w = e.font.getAdvanceWidth(text, 1000, { kerning: true });
        cache.set(key, w);
      }
      return (w / 1000) * spec.size;
    },
    ascent(spec) {
      const e = pick(spec);
      if (!e) return fallback.ascent(spec);
      const f = e.font;
      const asc = f.tables.hhea?.ascender ?? f.ascender;
      const desc = Math.abs(f.tables.hhea?.descender ?? f.descender);
      // center the em box like CSS does for line boxes
      return (asc + (f.unitsPerEm - asc - desc) / 2) / f.unitsPerEm;
    },
  };
}
