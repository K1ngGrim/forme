/** Templates shipped with Forme: folders under /examples. Shared by the web app and the CLI. */
export interface Template {
  id: string;
  name: string;
  description: string;
  /** Folder below /examples ('' = examples root, null = only the built-in new deck). */
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

/** Path of an /examples file inside a template, or null when the file does not belong to it. */
export function pathInTemplate(t: Template, rel: string): string | null {
  if (t.dir === null || rel.startsWith('__golden__/')) return null;
  if (t.dir) return rel.startsWith(`${t.dir}/`) ? rel.slice(t.dir.length + 1) : null;
  const top = rel.split('/')[0] as string;
  return t.include?.includes(top) ? rel : null;
}
