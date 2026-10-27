import { NEW_DECK_SOURCE } from '@forme/core';

/** Templates shipped with the app: the folders under /examples, bundled at build time. */

const texts = import.meta.glob<string>(['../../../../examples/**/*.forme'], { query: '?raw', import: 'default', eager: true });
const binaries = import.meta.glob<string>(['../../../../examples/**/*.{woff,woff2,ttf,otf,png,jpg,jpeg,svg,gif,webp}', '!**/__golden__/**'], {
  query: '?url',
  import: 'default',
  eager: true,
});

const PREFIX = '../../../../examples/';

export interface Template {
  id: string;
  name: string;
  description: string;
  /** Folder below /examples ('' = examples root). */
  dir: string | null;
  /** Restrict a root template to these top-level entries. */
  include?: string[];
  deck: string;
}

export const TEMPLATES: Template[] = [
  { id: 'leer', name: 'Leere Präsentation', description: 'Eingebautes Standard-Theme, eine Titelfolie', dir: null, deck: 'deck.forme' },
  { id: 'hka-seminar', name: 'HKA Seminar', description: 'Inter, Funkturm-Motiv, dreiteilige Fußzeile', dir: 'hka-seminar', deck: 'deck.forme' },
  { id: 'hka-projektarbeit', name: 'HKA Projektarbeit', description: 'Roboto, Karten, Kapiteltrenner „Teil X von Y“', dir: 'hka-projektarbeit', deck: 'deck.forme' },
  { id: 'guide', name: 'Beispiel aus dem Guide', description: 'Eigenes Theme mit Komponenten, dazu Rezept-Folien (docs/guide.md)', dir: 'guide', deck: 'deck.forme' },
  {
    id: 'quartalsbericht',
    name: 'Beispiel: Quartalsbericht',
    description: 'Zeigt Layouts, Komponenten, Tabellen und Nummerierung',
    dir: '',
    include: ['deck.forme', 'themes', 'img'],
    deck: 'deck.forme',
  },
];

function inTemplate(t: Template, rel: string): string | null {
  if (t.dir === null) return null;
  if (t.dir) return rel.startsWith(`${t.dir}/`) ? rel.slice(t.dir.length + 1) : null;
  const top = rel.split('/')[0] as string;
  return t.include?.includes(top) ? rel : null;
}

/** All files of a template, ready to be written into a new project. */
export async function templateFiles(t: Template): Promise<Record<string, string | Uint8Array>> {
  if (t.dir === null) return { [t.deck]: NEW_DECK_SOURCE };
  const out: Record<string, string | Uint8Array> = {};
  for (const [key, text] of Object.entries(texts)) {
    const p = inTemplate(t, key.slice(PREFIX.length));
    if (p) out[p] = text;
  }
  await Promise.all(
    Object.entries(binaries).map(async ([key, url]) => {
      const p = inTemplate(t, key.slice(PREFIX.length));
      if (!p) return;
      const res = await fetch(url);
      out[p] = new Uint8Array(await res.arrayBuffer());
    }),
  );
  return out;
}
