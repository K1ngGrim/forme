import { describe, expect, it } from 'vitest';
import { completeLine, evaluate, findCitations, parse, parseBib, refFields } from '../src/index.js';
import type { DeckScene } from '../src/index.js';

const BIB = String.raw`% Kommentar mit @schlüssel
@string{nmi = "Nature Machine Intelligence"}
@article{geirhos2020,
  author = {Geirhos, Robert and Jacobsen, J{\"o}rn-Henrik and Michaelis, Claudio},
  title = {Shortcut {Learning} in Deep Neural Networks},
  journal = nmi, year = 2020, pages = {665--673}
}
@inproceedings{arp2022, author = "Daniel Arp and Erwin Quiring", title = "Dos and Don'ts", booktitle = {USENIX Security}, year = {2022}}
@book{knuth1984, author = {Donald E. Knuth}, title = {The {\TeX}book}, publisher = {Addison-Wesley}, year = {1984}}
@misc{org, author = {{Bundesamt für Sicherheit}}, title = {Lagebericht}, year = {2024}}
`;

describe('bibtex', () => {
  it('parses entries, names, macros and LaTeX', () => {
    const { entries, errors } = parseBib(BIB);
    expect(errors).toEqual([]);
    expect(entries.map((e) => e.key)).toEqual(['geirhos2020', 'arp2022', 'knuth1984', 'org']);
    const g = entries[0]!;
    expect(g.fields.journal).toBe('Nature Machine Intelligence');
    expect(g.fields.pages).toBe('665–673');
    expect(g.authors[1]).toEqual(['Jacobsen', 'Jörn-Henrik']);
    expect(refFields(g, 3)).toMatchObject({ n: 3, author: 'Geirhos et al.', authors: 'R. Geirhos, J.-H. Jacobsen und C. Michaelis', year: '2020', venue: 'Nature Machine Intelligence', title: 'Shortcut Learning in Deep Neural Networks' });
    expect(refFields(entries[1]!, 0)).toMatchObject({ author: 'Arp & Quiring', venue: 'USENIX Security' });
    expect(refFields(entries[2]!, 0)).toMatchObject({ author: 'Knuth', authors: 'D. E. Knuth', title: 'The TeXbook' });
    expect(refFields(entries[3]!, 0)).toMatchObject({ author: 'Bundesamt für Sicherheit' });
  });

  it('reports broken entries with their offset and keeps the rest', () => {
    const { entries, errors } = parseBib('@article{a, title = {offen\n@book{b, title={B}}');
    expect(errors.length).toBeGreaterThan(0);
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });

  it('finds citations, not e-mail addresses', () => {
    expect(findCitations('Siehe @a2020[S. 4], @b.c und mail@x.de oder @end.').map((c) => [c.key, c.supplement])).toEqual([
      ['a2020', 'S. 4'],
      ['b.c', undefined],
      ['end', undefined],
    ]);
  });
});

describe('citations', () => {
  const run = (deck: string, theme = 'theme "T"\n'): DeckScene => evaluate(parse(deck), { theme: parse(theme), bibliographies: { 'q.bib': BIB } });
  const text = (s: DeckScene, slide: number, id: string): unknown => s.slides[slide]!.byId.get(id)?.props.text;

  it('numbers by first citation across the deck, with the default and a theme format', () => {
    const deck = 'bibliography "q.bib"\nslide @a {\n  text @t "x @arp2022 y @knuth1984[S. 3]"\n}\nslide @b {\n  text @t2 "@knuth1984 und @arp2022, a@b.de"\n}\n';
    let s = run(deck);
    expect(s.diagnostics).toEqual([]);
    expect(text(s, 0, 't')).toBe('x [1] y [2, S. 3]');
    expect(text(s, 1, 't2')).toBe('[2] und [1], a@b.de');
    s = run(deck, 'theme "T"\ncite format="({ref.author} {ref.year}{supplement})" supplement=": {page}"\n');
    expect(text(s, 0, 't')).toBe('x (Arp & Quiring 2022) y (Knuth 1984: S. 3)');
  });

  it('leaves raw strings, notes and unknown keys alone (with a warning)', () => {
    const s = run('bibliography "q.bib"\nslide @a {\n  code @c lang=java """@Override"""\n  text @t "@nope"\n  notes "@arp2022"\n}\n');
    expect(text(s, 0, 'c')).toBe('@Override');
    expect(text(s, 0, 't')).toBe('@nope');
    expect(s.slides[0]!.notes).toBe('[1]');
    expect(s.diagnostics.map((d) => d.message)).toEqual(['Quelle „@nope“ steht nicht in der Bibliografie']);
  });

  it('the master lists the sources of each slide with for and if', () => {
    const theme = 'theme "T"\nmaster default {\n  if slide.refs {\n    column @quellen x=0 y=900 w=1000 {\n      for ref in slide.refs {\n        text @q "{ref.i}/{slide.refs}: {ref.author} {ref.year}{ref.doi}"\n      }\n    }\n  }\n}\n';
    const s = run('bibliography "q.bib"\nslide @a {\n  text @t "@geirhos2020 @arp2022"\n}\nslide @b\n', theme);
    expect(s.diagnostics).toEqual([]);
    expect(text(s, 0, 'q_1')).toBe('1/2: Geirhos et al. 2020');
    expect(text(s, 0, 'q_2')).toBe('2/2: Arp & Quiring 2022');
    // q_2 sits below q_1 (column)
    expect(s.slides[0]!.byId.get('q_2')!.box.y).toBeGreaterThan(s.slides[0]!.byId.get('q_1')!.box.y);
    expect(s.slides[1]!.byId.has('quellen')).toBe(false);
  });

  it('loops resolve ids per iteration and report wrong lists', () => {
    const s = run('bibliography "q.bib"\nslide @a {\n  for r in bib {\n    rect @k x=10 w=100 h=20\n    text @l "{r.key}" y=@k.bottom\n  }\n  for r in foo {\n  }\n}\n');
    expect([...s.slides[0]!.byId.keys()]).toEqual(['k_1', 'l_1', 'k_2', 'l_2', 'k_3', 'l_3', 'k_4', 'l_4']);
    expect(text(s, 0, 'l_4')).toBe('org');
    expect(s.diagnostics.map((d) => d.message)).toEqual(['Unbekannte Liste „foo“ (möglich: slide.refs, deck.refs, bib)']);
  });

  it('reports a missing bibliography and completes keys in strings', () => {
    expect(evaluate(parse('bibliography "x.bib"\n')).diagnostics[0]?.message).toBe('Datei „x.bib“ nicht gefunden');
    const s = run('bibliography "q.bib"\nslide @a\n');
    const items = completeLine('  text @t "siehe @ge', 20, s, s.slides[0]!)?.items.map((i) => i.label);
    expect(items).toContain('@geirhos2020');
    expect(completeLine('  text @t x=@', 13, s, s.slides[0]!)?.items.map((i) => i.label)).not.toContain('@geirhos2020');
  });
});
