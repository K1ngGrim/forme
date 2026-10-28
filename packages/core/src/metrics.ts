/** Font description handed to a measurer. */
export interface FontSpec {
  family: string;
  size: number;
  weight: number;
  italic: boolean;
}

/** Text measurement is injected so `core` stays free of DOM and Node APIs. */
export interface TextMeasurer {
  /** Advance width of `text` in px. */
  width(text: string, font: FontSpec): number;
  /** Ascent as a fraction of the font size (baseline offset). */
  ascent(font: FontSpec): number;
}

// Helvetica advance widths (1/1000 em) for ASCII 32..126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
  556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
  556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
  500, 500, 500, 334, 260, 334, 584,
];

const EXTRA: Record<string, number> = {
  '€': 556,
  ß: 611,
  '–': 556,
  '—': 1000,
  '„': 333,
  '“': 333,
  '”': 333,
  '‘': 222,
  '’': 222,
  '•': 350,
  '…': 1000,
  '·': 278,
  '°': 400,
  '×': 584,
  ' ': 278,
};

function charWidth(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return HELVETICA[code - 32] as number;
  const extra = EXTRA[ch];
  if (extra !== undefined) return extra;
  const base = ch.normalize('NFD')[0];
  if (base && base !== ch) return charWidth(base);
  return code > 0x2e80 ? 1000 : 556;
}

/** Built-in monospace font (`code` without a theme font): all glyphs 0.6 em wide. */
export const MONO_FAMILY = 'monospace';

export function isMonospace(family: string): boolean {
  return /^(monospace|courier( new)?|consolas|menlo|monaco)$|\bmono\b/i.test(family.trim());
}

/**
 * Deterministic fallback measurer based on Helvetica metrics. Used when no real
 * font data is available (and in tests), so layout is identical everywhere.
 */
export function createMetricMeasurer(): TextMeasurer {
  return {
    width(text, font) {
      if (isMonospace(font.family)) return [...text].length * 0.6 * font.size;
      let w = 0;
      for (const ch of text) w += charWidth(ch);
      const boldFactor = font.weight >= 600 ? 1.06 : 1;
      return (w / 1000) * font.size * boldFactor;
    },
    ascent() {
      return 0.77;
    },
  };
}
