/**
 * Structure of the docs site. Every page is a section of a Markdown file in /docs, so the
 * Markdown files stay the single source (docs/language.md remains the binding reference).
 */
export interface PageSpec {
  /** URL path below the docs root ('' = start page), without leading or trailing slash. */
  slug: string;
  title: string;
  group: string;
  /** Markdown file in /docs. */
  file: string;
  /** Heading text of the section (without #). Omitted: the whole file below its H1. */
  heading?: string;
}

export const GROUPS = ['Einstieg', 'Anleitung', 'Referenz', 'Werkzeuge'] as const;

export const PAGES: PageSpec[] = [
  { slug: '', title: 'Überblick', group: 'Einstieg', file: 'index.md' },
  { slug: 'einstieg/prinzip', title: 'Das Prinzip', group: 'Einstieg', file: 'guide.md', heading: '1. Das Prinzip in drei Sätzen' },
  { slug: 'einstieg/schnellstart', title: 'Schnellstart', group: 'Einstieg', file: 'guide.md', heading: '2. Schnellstart' },
  { slug: 'einstieg/sprache', title: 'Die Sprache in fünf Minuten', group: 'Einstieg', file: 'guide.md', heading: '3. Die Sprache in fünf Minuten' },

  { slug: 'anleitung/rezepte', title: 'Folien bauen: Rezepte', group: 'Anleitung', file: 'guide.md', heading: '4. Folien bauen – Rezepte' },
  { slug: 'anleitung/anordnen', title: 'Positionieren und Anordnen', group: 'Anleitung', file: 'guide.md', heading: '5. Positionieren und Anordnen' },
  { slug: 'anleitung/theme', title: 'Ein eigenes Theme bauen', group: 'Anleitung', file: 'guide.md', heading: '6. Ein eigenes Theme bauen' },
  { slug: 'anleitung/vorlagen', title: 'Mitgelieferte Vorlagen', group: 'Anleitung', file: 'guide.md', heading: '7. Die mitgelieferten Vorlagen' },
  { slug: 'anleitung/fallstricke', title: 'Fallstricke und Fehlermeldungen', group: 'Anleitung', file: 'guide.md', heading: '11. Fallstricke und Fehlermeldungen' },
  { slug: 'anleitung/spickzettel', title: 'Spickzettel', group: 'Anleitung', file: 'guide.md', heading: '12. Spickzettel' },

  { slug: 'referenz/grundlagen', title: 'Grundlagen', group: 'Referenz', file: 'language.md', heading: 'Grundlagen' },
  { slug: 'referenz/werte', title: 'Werte und Ausdrücke', group: 'Referenz', file: 'language.md', heading: 'Werte und Ausdrücke' },
  { slug: 'referenz/dateien', title: 'Deck und Theme', group: 'Referenz', file: 'language.md', heading: 'Dateiarten' },
  { slug: 'referenz/erzeugen', title: 'Erzeugen', group: 'Referenz', file: 'language.md', heading: 'Erzeugen' },
  { slug: 'referenz/veraendern', title: 'Verändern', group: 'Referenz', file: 'language.md', heading: 'Verändern' },
  { slug: 'referenz/anordnen', title: 'Anordnen', group: 'Referenz', file: 'language.md', heading: 'Anordnen' },
  { slug: 'referenz/container', title: 'Layout-Container', group: 'Referenz', file: 'language.md', heading: 'Layout-Container (`row`, `column`)' },
  { slug: 'referenz/nummerierung', title: 'Nummerierung', group: 'Referenz', file: 'language.md', heading: 'Nummerierung' },
  { slug: 'referenz/sonstiges', title: 'Notizen und Sonstiges', group: 'Referenz', file: 'language.md', heading: 'Sonstiges' },
  { slug: 'referenz/definitionen', title: 'Theme-Definitionen', group: 'Referenz', file: 'language.md', heading: 'Definitionen (nur Theme)' },
  { slug: 'referenz/rueckschreiben', title: 'Rückschreibe-Regeln', group: 'Referenz', file: 'language.md', heading: 'Synchronisation mit dem Editor (Rückschreibe-Regeln)' },
  { slug: 'referenz/pptx', title: 'PPTX-Abbildung', group: 'Referenz', file: 'language.md', heading: 'Export-Abbildung (PPTX)' },

  { slug: 'werkzeuge/editor', title: 'Web-Editor', group: 'Werkzeuge', file: 'guide.md', heading: '8. Arbeiten im Editor' },
  { slug: 'werkzeuge/export', title: 'Export', group: 'Werkzeuge', file: 'guide.md', heading: '9. Export' },
  { slug: 'werkzeuge/cli', title: 'Kommandozeile', group: 'Werkzeuge', file: 'tools.md', heading: 'Kommandozeile' },
  { slug: 'werkzeuge/vscode', title: 'VS Code', group: 'Werkzeuge', file: 'tools.md', heading: 'VS Code' },
  { slug: 'werkzeuge/ki', title: 'Mit KI-Assistenten', group: 'Werkzeuge', file: 'guide.md', heading: '10. Regeln für KI-Assistenten' },
];

export const REPO_URL = 'https://github.com/K1ngGrim/forme';
