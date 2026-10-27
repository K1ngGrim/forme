import { ALIGN_MODES, ALL_VERBS, DIRECTIONS, ENUM_VALUES, KEYS_BY_VERB, Z_MODES } from './index.js';
import type { DeckScene, PropValue, SlideScene } from './index.js';

export interface CompletionItem {
  label: string;
  type: 'keyword' | 'variable' | 'constant' | 'property' | 'enum' | 'class';
  detail?: string;
  /** Text inserted instead of label. */
  apply?: string;
}

export interface CompletionResult {
  from: number;
  items: CompletionItem[];
}

const VERB_INFO: Record<string, string> = {
  rect: 'Rechteck',
  ellipse: 'Ellipse',
  line: 'Linie',
  arrow: 'Pfeil',
  polygon: 'Polygon',
  path: 'Pfad',
  text: 'Text',
  list: 'Liste',
  image: 'Bild',
  table: 'Tabelle',
  group: 'Gruppe',
  use: 'Komponente einsetzen',
  slot: 'Platzhalter (Layout)',
  fill: 'Slot befüllen',
  set: 'Eigenschaften setzen',
  move: 'verschieben',
  resize: 'Größe ändern',
  round: 'Ecken runden',
  style: 'Stil anwenden / definieren',
  stroke: 'Kontur',
  shadow: 'Schatten',
  opacity: 'Deckkraft',
  hide: 'ausblenden',
  show: 'einblenden',
  z: 'Ebenenreihenfolge',
  align: 'ausrichten',
  distribute: 'verteilen',
  stack: 'stapeln (Auto-Layout)',
  grid: 'Raster',
  number: 'nummerieren',
  notes: 'Sprechernotizen',
  background: 'Hintergrund',
  slide: 'neue Folie',
  row: 'Zeile (Kinder nebeneinander, wie Bootstrap-Row)',
  column: 'Spalte (Kinder untereinander)',
  section: 'Abschnitt',
  counter: 'Zähler',
};

function valueText(v: PropValue | undefined): string {
  return v === undefined ? '' : String(v);
}

/** Context-aware completion for one line of Forme. Used by CodeMirror and the command line. */
export function completeLine(line: string, col: number, scene: DeckScene, slide: SlideScene | null): CompletionResult | null {
  const before = line.slice(0, col);
  const ids = (): CompletionItem[] => {
    const own = slide ? [...slide.byId.values()].map((n) => ({ label: `@${n.id}`, type: 'variable' as const, detail: n.kind })) : [];
    const others = scene.slides.flatMap((s) => (s === slide ? [] : [{ label: `@${s.id}`, type: 'class' as const, detail: 'Folie' }]));
    return [...own, ...others];
  };

  let m = /@([\wÀ-ɏ]*)$/.exec(before);
  if (m) return { from: col - m[0].length, items: ids() };

  m = /\$([\w.]*)$/.exec(before);
  if (m) {
    return {
      from: col - m[0].length,
      items: Object.entries(scene.theme.tokens).map(([k, v]) => ({ label: `$${k}`, type: 'constant', detail: valueText(v) })),
    };
  }

  m = /([\w.]+)=([\w"#.]*)$/.exec(before);
  if (m) {
    const key = m[1] as string;
    const from = col - (m[2] as string).length;
    let values: string[] = [];
    if (key === 'style') values = Object.keys(scene.theme.styles);
    else if (key === 'layout') values = scene.theme.layouts;
    else if (key === 'master') values = scene.theme.masters;
    else if (key === 'font') values = scene.theme.fonts.map((f) => f.name);
    else if (key === 'within' || key === 'to') values = ['slide', ...Object.keys(slide?.regions ?? {}), ...(key === 'to' ? ['first', 'last'] : [])];
    else if (key === 'like' || key === 'in') return { from, items: ids() };
    else if (key === 'align' && /^\s*(row|column)\b/.test(line)) values = ['start', 'center', 'end', 'stretch'];
    else if (key in ENUM_VALUES) values = ENUM_VALUES[key] as string[];
    else if (key === 'italic' || key === 'hidden' || key === 'header') values = ['true', 'false'];
    if (!values.length) return null;
    return { from, items: values.map((v) => ({ label: v, type: 'enum' })) };
  }

  m = /^(\s*)([\w]*)$/.exec(before);
  if (m) {
    return {
      from: col - (m[2] as string).length,
      items: ALL_VERBS.map((v) => {
        const info = VERB_INFO[v];
        return info ? { label: v, type: 'keyword' as const, detail: info } : { label: v, type: 'keyword' as const };
      }),
    };
  }

  const verb = /^\s*(\w+)/.exec(line)?.[1] ?? '';
  m = /(?:^|\s)([\w.]*)$/.exec(before);
  if (!m) return null;
  const word = m[1] as string;
  const from = col - word.length;
  const positional = before.trimStart().split(/\s+/).length - 1;
  const items: CompletionItem[] = [];
  if (verb === 'align' && positional === 1) items.push(...ALIGN_MODES.map((v) => ({ label: v, type: 'enum' as const })));
  if ((verb === 'distribute' || verb === 'stack') && positional === 1) items.push(...DIRECTIONS.map((v) => ({ label: v, type: 'enum' as const })));
  if (verb === 'z') items.push(...Z_MODES.map((v) => ({ label: v, type: 'enum' as const })));
  if (verb === 'use') items.push(...scene.theme.components.map((c) => ({ label: c, type: 'class' as const, detail: 'Komponente' })));
  if (verb === 'number' && positional === 1) items.push(...['figure', 'table'].map((c) => ({ label: c, type: 'enum' as const, detail: 'Zähler' })));
  if (verb === 'style' && positional === 2) items.push(...Object.keys(scene.theme.styles).map((c) => ({ label: c, type: 'class' as const })));
  const keys = KEYS_BY_VERB[verb === 'slot' ? 'slot' : verb] ?? [];
  items.push(...keys.map((k) => ({ label: `${k}=`, type: 'property' as const })));
  return items.length ? { from, items } : null;
}
