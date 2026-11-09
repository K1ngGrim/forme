/**
 * BibTeX: a small, tolerant parser for `.bib` files (entries, fields in braces or quotes,
 * `#` concatenation, @string macros, common LaTeX accents). Pure, no I/O.
 */

export interface BibEntry {
  key: string;
  /** Entry type in lower case (article, inproceedings, book, misc …). */
  type: string;
  /** Fields with lower-case names, LaTeX converted to plain text. */
  fields: Record<string, string>;
  /** Authors (or editors) as [last name, first names]. */
  authors: [string, string][];
}

export interface BibError {
  message: string;
  /** Offset in the .bib source. */
  offset: number;
}

const ACCENTS: Record<string, Record<string, string>> = {
  '"': { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü', e: 'ë', i: 'ï', y: 'ÿ', E: 'Ë', I: 'Ï' },
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', c: 'ć', n: 'ń', s: 'ś', z: 'ź' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' },
  '~': { a: 'ã', n: 'ñ', o: 'õ', A: 'Ã', N: 'Ñ', O: 'Õ' },
  c: { c: 'ç', C: 'Ç', s: 'ş', S: 'Ş' },
  v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', C: 'Č', S: 'Š', Z: 'Ž', R: 'Ř' },
};

const SYMBOLS: Record<string, string> = { ss: 'ß', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', ae: 'æ', AE: 'Æ', l: 'ł', L: 'Ł', i: 'ı', '&': '&', '%': '%', $: '$', _: '_', '#': '#' };

/** LaTeX in field values to plain text: accents, a few symbols, braces and simple commands removed. */
export function latexToText(s: string): string {
  let out = s.replace(/\\([`'^"~])\s*\{?\\?([A-Za-z])\}?/g, (m, acc: string, ch: string) => ACCENTS[acc]?.[ch] ?? m);
  out = out.replace(/\\([cv])\s*\{([A-Za-z])\}/g, (m, acc: string, ch: string) => ACCENTS[acc]?.[ch] ?? m);
  out = out.replace(/\\(ss|aa|AA|ae|AE|o|O|l|L|i)\b\s?/g, (_m, c: string) => SYMBOLS[c] ?? '');
  out = out.replace(/\\([&%$_#])/g, '$1');
  out = out.replace(/\\(La)?TeX\b\s?/g, (_m, la: string | undefined) => `${la ?? ''}TeX`);
  out = out.replace(/---/g, '—').replace(/--/g, '–').replace(/~/g, ' ');
  out = out.replace(/\\(?:emph|textit|textbf|textsc|texttt|url|mkbibquote)\s*\{([^{}]*)\}/g, '$1');
  out = out.replace(/\\[A-Za-z]+\s*/g, '');
  return out.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

/** "Last, First and First Last and others" -> [last, first][]. */
export function parseNames(s: string): [string, string][] {
  const names: [string, string][] = [];
  // split at " and " outside braces
  let depth = 0;
  let cur = '';
  const parts: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth === 0 && /^\s+and\s+/i.test(s.slice(i)) && /\s/.test(c)) {
      parts.push(cur);
      cur = '';
      i += (/^\s+and\s+/i.exec(s.slice(i)) as RegExpExecArray)[0].length - 1;
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (/^others$/i.test(p)) {
      names.push(['others', '']);
      continue;
    }
    if (p.startsWith('{') && p.endsWith('}') && !p.slice(1, -1).includes('}')) {
      // {Institution Name}: one last name
      names.push([latexToText(p), '']);
      continue;
    }
    const comma = p.split(',');
    if (comma.length >= 2) {
      names.push([latexToText(comma[0] as string), latexToText(comma.slice(1).join(','))]);
      continue;
    }
    const words = p.split(/\s+/);
    // "von" particles stay with the last name
    let i = words.length - 1;
    while (i > 0 && /^[a-z]/.test(words[i - 1] as string)) i--;
    names.push([latexToText(words.slice(i).join(' ')), latexToText(words.slice(0, i).join(' '))]);
  }
  return names;
}

const MONTHS: Record<string, string> = { jan: 'Januar', feb: 'Februar', mar: 'März', apr: 'April', may: 'Mai', jun: 'Juni', jul: 'Juli', aug: 'August', sep: 'September', oct: 'Oktober', nov: 'November', dec: 'Dezember' };

/** Parse a .bib source. Never throws; problems come back as errors with offsets. */
export function parseBib(text: string): { entries: BibEntry[]; errors: BibError[] } {
  // comment lines (% …) blanked out, offsets stay the same
  const src = text.replace(/^[ \t]*%.*$/gm, (m) => ' '.repeat(m.length));
  const entries: BibEntry[] = [];
  const errors: BibError[] = [];
  const macros: Record<string, string> = { ...MONTHS };
  let i = 0;
  const ws = (): void => {
    while (i < src.length) {
      if (/\s/.test(src[i] as string)) i++;
      else if (src[i] === '%') while (i < src.length && src[i] !== '\n') i++;
      else break;
    }
  };
  const braced = (): string => {
    // src[i] === '{'
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === '\\') {
        i++;
        continue;
      }
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          i++;
          return src.slice(start + 1, i - 1);
        }
      }
    }
    errors.push({ message: '„}“ fehlt', offset: start });
    return src.slice(start + 1);
  };
  const quoted = (): string => {
    const start = ++i;
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === '\\') {
        i++;
        continue;
      }
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      else if (src[i] === '"' && depth === 0) return src.slice(start, i++);
    }
    errors.push({ message: 'Anführungszeichen nicht geschlossen', offset: start - 1 });
    return src.slice(start);
  };
  const ident = (): string => {
    const m = /^[^\s,={}()"#%]+/.exec(src.slice(i));
    if (!m) return '';
    i += m[0].length;
    return m[0];
  };
  const value = (): string => {
    let out = '';
    for (;;) {
      ws();
      const c = src[i];
      if (c === '{') out += braced();
      else if (c === '"') out += quoted();
      else {
        const id = ident();
        if (!id) {
          errors.push({ message: 'Wert erwartet', offset: i });
          return out;
        }
        out += /^\d+$/.test(id) ? id : (macros[id.toLowerCase()] ?? id);
      }
      ws();
      if (src[i] === '#') {
        i++;
        continue;
      }
      return out;
    }
  };

  while (i < src.length) {
    const at = src.indexOf('@', i);
    if (at < 0) break;
    i = at + 1;
    const type = ident().toLowerCase();
    ws();
    const open = src[i];
    if (open !== '{' && open !== '(') {
      errors.push({ message: `„{“ nach @${type} erwartet`, offset: at });
      continue;
    }
    const close = open === '{' ? '}' : ')';
    i++;
    if (type === 'comment' || type === 'preamble') {
      i--;
      if (open === '{') braced();
      continue;
    }
    if (type === 'string') {
      ws();
      const name = ident().toLowerCase();
      ws();
      if (src[i] === '=') i++;
      macros[name] = value();
      ws();
      if (src[i] === close) i++;
      continue;
    }
    ws();
    const key = ident().replace(/,$/, '');
    ws();
    if (src[i] === ',') i++;
    const rawFields: Record<string, string> = {};
    for (;;) {
      ws();
      if (i >= src.length) {
        errors.push({ message: `Eintrag „${key}“ wird nicht geschlossen`, offset: at });
        break;
      }
      if (src[i] === close) {
        i++;
        break;
      }
      const name = ident().toLowerCase();
      ws();
      if (!name || src[i] !== '=') {
        errors.push({ message: `Feld in „${key}“ erwartet`, offset: i });
        // skip to the next comma or the end of the entry
        while (i < src.length && src[i] !== ',' && src[i] !== close) i++;
        if (src[i] === ',') i++;
        continue;
      }
      i++;
      rawFields[name] = value();
      ws();
      if (src[i] === ',') i++;
    }
    if (!key) {
      errors.push({ message: `@${type} ohne Schlüssel`, offset: at });
      continue;
    }
    if (entries.some((e) => e.key === key)) errors.push({ message: `Schlüssel „${key}“ doppelt`, offset: at });
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawFields)) fields[k] = k === 'url' || k === 'doi' ? v.replace(/[{}]/g, '').trim() : latexToText(v);
    const who = rawFields.author ?? rawFields.editor ?? '';
    entries.push({ key, type, fields, authors: parseNames(who) });
  }
  return { entries, errors };
}

/** Line and column (1-based) of an offset, for messages about .bib files. */
export function lineCol(src: string, offset: number): { line: number; column: number } {
  const before = src.slice(0, offset).split('\n');
  return { line: before.length, column: (before[before.length - 1] as string).length + 1 };
}

/**
 * Fields of an entry as seen from Forme (`ref.<field>`): every .bib field plus
 * key, type, n, author (short, e.g. „Jacobs et al.“), authors (full), year, venue.
 */
export function refFields(e: BibEntry, n: number): Record<string, string | number> {
  const real = e.authors.filter((a) => a[0] !== 'others');
  const etal = real.length > 2 || e.authors.some((a) => a[0] === 'others');
  const last = real.map((a) => a[0]);
  const short = !last.length ? (e.fields.title ?? e.key) : etal ? `${last[0]} et al.` : last.join(' & ');
  const initials = (first: string): string =>
    first
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.split('-').map((p) => `${p[0] ?? ''}.`).join('-'))
      .join(' ');
  const full = real.map(([l, f]) => (f ? `${initials(f)} ${l}` : l));
  const authors = full.length > 1 ? `${full.slice(0, -1).join(', ')} und ${full[full.length - 1]}` : (full[0] ?? '');
  const year = e.fields.year ?? (/\d{4}/.exec(e.fields.date ?? '')?.[0] ?? '');
  const venue = e.fields.journal ?? e.fields.journaltitle ?? e.fields.booktitle ?? e.fields.publisher ?? e.fields.institution ?? e.fields.school ?? e.fields.howpublished ?? '';
  return {
    ...e.fields,
    key: e.key,
    type: e.type,
    n,
    author: short,
    authors: authors + (e.authors.some((a) => a[0] === 'others') ? ' et al.' : ''),
    lastnames: last.join(', '),
    year,
    venue,
    title: e.fields.title ?? '',
  };
}

export interface Citation {
  key: string;
  /** Text in brackets after the key: `@key[S. 4]`. */
  supplement?: string;
  index: number;
  length: number;
}

/**
 * Citations `@key` or `@key[supplement]` in a text. An `@` right after a letter, digit, `.` or
 * `/` (e-mail addresses, paths) does not start a citation; a trailing `.` ends the key.
 */
export function findCitations(text: string): Citation[] {
  const out: Citation[] = [];
  const re = /(^|[^\p{L}\p{N}_@./\\])@([\p{L}\p{N}_][\p{L}\p{N}_:-]*(?:[./][\p{L}\p{N}_:-]+)*)(?:\[([^\]\n]*)\])?/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lead = (m[1] as string).length;
    out.push({ key: m[2] as string, ...(m[3] !== undefined ? { supplement: m[3] } : {}), index: m.index + lead, length: m[0].length - lead });
  }
  return out;
}
