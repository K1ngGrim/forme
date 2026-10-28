import type { HighlightClass } from './highlight.js';
import { classifySource } from './highlight.js';
import { lex } from './lexer.js';

/**
 * Syntax highlighting for `code` blocks: a small tokenizer per language, good enough for slides.
 * Pure: classes only, colors come from the palette of the evaluator.
 */

export type CodeClass = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'type' | 'constant' | 'meta';

export const CODE_CLASSES: CodeClass[] = ['plain', 'keyword', 'string', 'comment', 'number', 'function', 'type', 'constant', 'meta'];

export interface CodeToken {
  text: string;
  cls: CodeClass;
}

interface LangDef {
  keywords: Set<string>;
  constants: Set<string>;
  types?: Set<string>;
  lineComment: string[];
  blockComment?: [string, string];
  quotes: string[];
  /** Python-style triple-quoted strings. */
  triple?: boolean;
  /** Keywords regardless of case (SQL). */
  ignoreCase?: boolean;
  /** `@name` is an annotation/decorator. */
  annotations?: boolean;
  /** Capitalized identifiers are types. */
  capitalTypes?: boolean;
}

const words = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

const C_LIKE = 'if else for while do switch case default break continue return goto sizeof typedef struct union enum static const volatile extern register inline';

const LANGS: Record<string, LangDef> = {
  python: {
    keywords: words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'),
    constants: words('True False None self cls'),
    types: words('int float str bool list dict set tuple bytes object type range len print isinstance super Exception'),
    lineComment: ['#'],
    quotes: ['"', "'"],
    triple: true,
    annotations: true,
    capitalTypes: true,
  },
  java: {
    keywords: words(
      'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized throw throws transient try volatile while var record yield sealed permits',
    ),
    constants: words('true false null this'),
    types: words('void boolean byte char short int long float double String Object Integer List Map Set'),
    lineComment: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'"],
    annotations: true,
    capitalTypes: true,
  },
  sql: {
    keywords: words(
      'select from where and or not in is null as join inner left right full outer cross on group by order having limit offset insert into values update set delete create table view index drop alter add column primary key foreign references distinct union all exists between like case when then else end asc desc with recursive returning default constraint unique check if replace begin commit rollback transaction grant revoke',
    ),
    constants: words('true false null'),
    types: words('int integer bigint smallint decimal numeric float real double varchar char text date time timestamp boolean serial uuid json jsonb blob'),
    lineComment: ['--'],
    blockComment: ['/*', '*/'],
    quotes: ["'", '"'],
    ignoreCase: true,
  },
  javascript: {
    keywords: words(
      'async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch throw try typeof var void while with yield get set',
    ),
    constants: words('true false null undefined this NaN Infinity'),
    lineComment: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'", '`'],
    capitalTypes: true,
  },
  c: {
    keywords: words(C_LIKE),
    constants: words('NULL true false'),
    types: words('void char short int long float double signed unsigned bool size_t'),
    lineComment: ['//'],
    blockComment: ['/*', '*/'],
    quotes: ['"', "'"],
  },
  json: { keywords: words(''), constants: words('true false null'), lineComment: [], quotes: ['"'] },
  bash: {
    keywords: words('if then else elif fi for while until do done case esac in function return export local readonly echo cd exit source'),
    constants: words('true false'),
    lineComment: ['#'],
    quotes: ['"', "'"],
  },
};

LANGS.typescript = {
  ...(LANGS.javascript as LangDef),
  keywords: words(
    'abstract as async await break case catch class const continue declare default delete do else enum export extends finally for from function if implements import in infer instanceof interface keyof let namespace new of private protected public readonly return satisfies static super switch throw try type typeof var void while yield',
  ),
  types: words('string number boolean any unknown never void object bigint symbol'),
};
LANGS.cpp = {
  ...(LANGS.c as LangDef),
  keywords: words(`${C_LIKE} class namespace template typename public private protected virtual override new delete using try catch throw this operator friend constexpr auto nullptr`),
  constants: words('true false nullptr this NULL'),
  types: words('void char short int long float double signed unsigned bool size_t string vector map auto'),
};
LANGS.csharp = {
  ...(LANGS.java as LangDef),
  keywords: words(
    'abstract as base break case catch class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch throw try typeof unchecked unsafe using virtual volatile while var async await get set record',
  ),
  types: words('void bool byte char decimal double float int long object sbyte short string uint ulong ushort'),
};
LANGS.go = {
  keywords: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'),
  constants: words('true false nil iota'),
  types: words('int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 float32 float64 string bool byte rune error any'),
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  quotes: ['"', "'", '`'],
};
LANGS.rust = {
  keywords: words('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return static struct super trait type unsafe use where while'),
  constants: words('true false self Self None Some Ok Err'),
  types: words('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box'),
  lineComment: ['//'],
  blockComment: ['/*', '*/'],
  quotes: ['"'],
  capitalTypes: true,
};
LANGS.kotlin = {
  ...(LANGS.java as LangDef),
  keywords: words('as break class continue do else for fun if in interface is null object package return super this throw try typealias typeof val var when while by catch constructor finally get import init override private protected public set open data sealed companion'),
};

const ALIASES: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  'c++': 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  rs: 'rust',
  kt: 'kotlin',
  postgres: 'sql',
  mysql: 'sql',
};

/** Languages with highlighting (without aliases), plus `forme` and `text`. */
export const CODE_LANGUAGES: string[] = [...Object.keys(LANGS), 'forme', 'text'];

export function codeLanguage(lang: string): string | null {
  const l = lang.toLowerCase();
  const name = ALIASES[l] ?? l;
  return name in LANGS || name === 'forme' || name === 'text' ? name : null;
}

const FORME_CLASSES: Partial<Record<HighlightClass, CodeClass>> = {
  verb: 'keyword',
  id: 'function',
  token: 'constant',
  number: 'number',
  color: 'number',
  string: 'string',
  comment: 'comment',
  key: 'type',
};

function formeTokens(src: string): CodeToken[] {
  const toks = lex(src);
  const marks = new Map(classifySource(toks));
  return toks.map((t) => {
    const c = marks.get(t);
    return { text: t.text, cls: (c && FORME_CLASSES[c]) ?? 'plain' };
  });
}

const IDENT = /[A-Za-z_$À-ɏ][\w$À-ɏ]*/y;
const NUMBER = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[a-zA-Z]*/y;

/** Split source code into highlighted tokens. Unknown languages come back as plain text. */
export function highlightCode(src: string, lang: string): CodeToken[] {
  const name = codeLanguage(lang);
  if (name === 'forme') return formeTokens(src);
  const def = name ? LANGS[name] : undefined;
  if (!def) return [{ text: src, cls: 'plain' }];
  const out: CodeToken[] = [];
  const push = (text: string, cls: CodeClass): void => {
    const last = out[out.length - 1];
    if (last && last.cls === cls) last.text += text;
    else out.push({ text, cls });
  };
  let i = 0;
  while (i < src.length) {
    const rest = (s: string): boolean => src.startsWith(s, i);
    const c = src[i] as string;
    const lc = def.lineComment.find(rest);
    if (lc) {
      let j = src.indexOf('\n', i);
      if (j < 0) j = src.length;
      push(src.slice(i, j), 'comment');
      i = j;
      continue;
    }
    if (def.blockComment && rest(def.blockComment[0])) {
      const end = src.indexOf(def.blockComment[1], i + def.blockComment[0].length);
      const j = end < 0 ? src.length : end + def.blockComment[1].length;
      push(src.slice(i, j), 'comment');
      i = j;
      continue;
    }
    if (def.quotes.includes(c)) {
      const triple = def.triple && rest(c.repeat(3)) ? c.repeat(3) : null;
      let j = i + (triple ? 3 : 1);
      while (j < src.length) {
        if (triple) {
          if (src.startsWith(triple, j)) {
            j += 3;
            break;
          }
        } else if (src[j] === c) {
          j++;
          break;
        } else if (src[j] === '\n' && c !== '`') break;
        if (src[j] === '\\' && !(def.ignoreCase)) j++;
        j++;
      }
      // SQL escapes quotes by doubling them
      push(src.slice(i, Math.min(j, src.length)), 'string');
      i = Math.min(j, src.length);
      continue;
    }
    if (def.annotations && c === '@') {
      IDENT.lastIndex = i + 1;
      const m = IDENT.exec(src);
      if (m) {
        push(`@${m[0]}`, 'meta');
        i += 1 + m[0].length;
        continue;
      }
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(src);
      if (m && m[0]) {
        push(m[0], 'number');
        i += m[0].length;
        continue;
      }
    }
    IDENT.lastIndex = i;
    const id = IDENT.exec(src);
    if (id) {
      const w = id[0];
      const key = def.ignoreCase ? w.toLowerCase() : w;
      let cls: CodeClass = 'plain';
      if (def.keywords.has(key)) cls = 'keyword';
      else if (def.constants.has(key)) cls = 'constant';
      else if (def.types?.has(key)) cls = 'type';
      else if (/^\s*\(/.test(src.slice(i + w.length, i + w.length + 40))) cls = 'function';
      else if (def.capitalTypes && /^[A-Z][a-z0-9]/.test(w)) cls = 'type';
      push(w, cls);
      i += w.length;
      continue;
    }
    push(c, 'plain');
    i++;
  }
  return out;
}

/** Default colors per class: light (GitHub-like) and dark (One Dark-like) palette. */
export const CODE_PALETTES: Record<'light' | 'dark', Record<CodeClass, string> & { background: string; lineNumber: string }> = {
  light: {
    plain: '#24292F',
    keyword: '#CF222E',
    string: '#0A3069',
    comment: '#6E7781',
    number: '#0550AE',
    function: '#8250DF',
    type: '#953800',
    constant: '#0550AE',
    meta: '#8250DF',
    background: '#F6F8FA',
    lineNumber: '#8C959F',
  },
  dark: {
    plain: '#ABB2BF',
    keyword: '#C678DD',
    string: '#98C379',
    comment: '#7F848E',
    number: '#D19A66',
    function: '#61AFEF',
    type: '#E5C07B',
    constant: '#D19A66',
    meta: '#C678DD',
    background: '#282C34',
    lineNumber: '#636D83',
  },
};
