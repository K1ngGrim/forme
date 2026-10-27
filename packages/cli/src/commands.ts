import { watch as fsWatch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import type { Diagnostic } from '@forme/core';
import { TEMPLATES } from '@forme/core';
import type { LoadCache, LoadedDeck, OutputFormat } from '@forme/export/node';
import { ChromiumSession, createLoadCache, formatOf, loadDeck, OUTPUT_FORMATS, writeOutput, writeTemplate } from '@forme/export/node';
import type { Args } from './args.js';
import { stringOption } from './args.js';
import type { Style } from './report.js';
import { diagnosticJson, formatDiagnostic } from './report.js';
import { findTemplate, templateRoot } from './templates.js';

export interface Io {
  cwd: string;
  out: (line: string) => void;
  err: (line: string) => void;
  style: Style;
}

interface Checked {
  loaded: LoadedDeck;
  errors: number;
  warnings: number;
  /** Diagnostics with file name and source, in file order. */
  items: { d: Diagnostic; file: string; src: string }[];
}

function needDeck(args: Args, io: Io): string {
  const file = args.positional[0];
  if (!file) throw new Error('Keine Präsentation angegeben (z. B. „forme compile deck.forme“)');
  return resolve(io.cwd, file);
}

async function checkDeck(deckPath: string, io: Io, cache?: LoadCache): Promise<Checked> {
  const loaded = await loadDeck(deckPath, cache ? { cache } : {});
  const themeSrc = loaded.themePath ? await readFile(loaded.themePath, 'utf8').catch(() => '') : '';
  const items = loaded.scene.diagnostics.map((d) => ({
    d,
    file: relative(io.cwd, d.file === 'theme' && loaded.themePath ? loaded.themePath : loaded.deckPath) || basename(loaded.deckPath),
    src: d.file === 'theme' ? themeSrc : loaded.deck.source,
  }));
  items.sort((a, b) => a.file.localeCompare(b.file) || a.d.span.start - b.d.span.start);
  return {
    loaded,
    items,
    errors: items.filter((i) => i.d.severity === 'error').length,
    warnings: items.filter((i) => i.d.severity === 'warning').length,
  };
}

function printDiagnostics(c: Checked, io: Io): void {
  for (const { d, file, src } of c.items) io.err(`${formatDiagnostic(d, file, src, io.style)}\n`);
}

function summary(c: Checked, io: Io): string {
  const parts = [`${c.loaded.scene.slides.length} Folien`];
  if (c.errors) parts.push(io.style.red(`${c.errors} Fehler`));
  if (c.warnings) parts.push(io.style.yellow(`${c.warnings} Warnung${c.warnings === 1 ? '' : 'en'}`));
  return parts.join(', ');
}

/** Output path: explicit argument or --out, otherwise the deck name with the --format extension (default PDF). */
function outputPath(args: Args, deckPath: string, io: Io): string {
  const explicit = args.positional[1] ?? stringOption(args, 'out');
  const format = stringOption(args, 'format');
  if (format && !(OUTPUT_FORMATS as readonly string[]).includes(format)) throw new Error(`Unbekanntes Format „${format}“ (möglich: ${OUTPUT_FORMATS.join(', ')})`);
  if (explicit) {
    const out = resolve(io.cwd, explicit);
    if (!formatOf(out) && format) return `${out}.${format}`;
    return out;
  }
  const ext: OutputFormat = (format as OutputFormat | undefined) ?? 'pdf';
  const base = deckPath.slice(0, deckPath.length - extname(deckPath).length);
  return ext === 'svg' ? `${base}-{n}.svg` : `${base}.${ext}`;
}

function chromiumFor(args: Args): ChromiumSession {
  const path = stringOption(args, 'chromium');
  return new ChromiumSession(path ? { executablePath: path } : {});
}

async function build(args: Args, io: Io, deckPath: string, out: string, chromium: ChromiumSession, cache?: LoadCache): Promise<Checked> {
  const started = Date.now();
  const c = await checkDeck(deckPath, io, cache);
  printDiagnostics(c, io);
  if (c.errors) {
    io.err(`${io.style.red('✗')} ${summary(c, io)}: nichts geschrieben`);
    return c;
  }
  const slide = stringOption(args, 'slide')?.replace(/^@/, '');
  const res = await writeOutput(c.loaded, out, chromium, slide ? { slide } : {});
  for (const l of res.log) io.err(`${io.style.dim('Export')} ${l}`);
  const files = res.files.map((f) => relative(io.cwd, f) || f);
  const shown = files.length > 3 ? `${files.slice(0, 2).join(', ')} … (${files.length} Dateien)` : files.join(', ');
  io.out(`${io.style.green('✓')} ${shown} ${io.style.dim(`(${summary(c, io)}, ${Date.now() - started} ms)`)}`);
  return c;
}

export async function compile(args: Args, io: Io): Promise<number> {
  const deckPath = needDeck(args, io);
  const out = outputPath(args, deckPath, io);
  const chromium = chromiumFor(args);
  try {
    const c = await build(args, io, deckPath, out, chromium);
    return c.errors ? 1 : 0;
  } finally {
    await chromium.close();
  }
}

export async function check(args: Args, io: Io): Promise<number> {
  const c = await checkDeck(needDeck(args, io), io);
  if (args.options.json) {
    io.out(JSON.stringify({ slides: c.loaded.scene.slides.length, errors: c.errors, warnings: c.warnings, diagnostics: c.items.map((i) => diagnosticJson(i.d, i.file, i.src)) }, null, 2));
  } else {
    printDiagnostics(c, io);
    io.out(`${c.errors ? io.style.red('✗') : io.style.green('✓')} ${summary(c, io)}`);
  }
  return c.errors ? 1 : 0;
}

/**
 * Compile, then recompile whenever the deck, the theme, a font or an image changes.
 * Watches the folders of all dependencies (editors often save by replacing the file).
 * Resolves when `signal` aborts.
 */
export async function watch(args: Args, io: Io, signal: AbortSignal): Promise<number> {
  const deckPath = needDeck(args, io);
  const out = outputPath(args, deckPath, io);
  const chromium = chromiumFor(args);
  const cache = createLoadCache();
  const watchers = new Map<string, FSWatcher>();
  let deps = new Set<string>([deckPath]);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();

  const run = (): Promise<void> =>
    (running = running.then(async () => {
      try {
        const c = await build(args, io, deckPath, out, chromium, cache);
        deps = new Set(c.loaded.dependencies);
      } catch (e) {
        io.err(`${io.style.red('Fehler')}: ${(e as Error).message}`);
      }
      syncWatchers();
    }));

  const syncWatchers = (): void => {
    const dirs = new Set([...deps].map((d) => dirname(d)));
    for (const [dir, w] of watchers) {
      if (!dirs.has(dir)) {
        w.close();
        watchers.delete(dir);
      }
    }
    for (const dir of dirs) {
      if (watchers.has(dir)) continue;
      try {
        const w = fsWatch(dir, (_event, name) => {
          if (name && !deps.has(resolve(dir, name.toString()))) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            io.out(io.style.dim(`[${new Date().toLocaleTimeString('de-DE')}] Änderung erkannt`));
            void run();
          }, 120);
        });
        watchers.set(dir, w);
      } catch {
        // folder vanished: picked up again after the next successful build
      }
    }
  };

  io.out(io.style.dim(`Beobachte ${relative(io.cwd, deckPath) || deckPath} → ${relative(io.cwd, out) || out} (Strg+C beendet)`));
  await run();
  await new Promise<void>((done) => {
    if (signal.aborted) done();
    else signal.addEventListener('abort', () => done(), { once: true });
  });
  if (timer) clearTimeout(timer);
  for (const w of watchers.values()) w.close();
  await running;
  await chromium.close();
  return 0;
}

export async function init(args: Args, io: Io): Promise<number> {
  const id = stringOption(args, 'template') ?? 'leer';
  const t = findTemplate(id);
  if (!t) throw new Error(`Unbekannte Vorlage „${id}“. Verfügbar: ${TEMPLATES.map((x) => x.id).join(', ')}`);
  const target = resolve(io.cwd, args.positional[0] ?? '.');
  const { written, skipped } = await writeTemplate(t, templateRoot(), target);
  for (const f of written) io.out(`  ${io.style.green('+')} ${f}`);
  for (const f of skipped) io.err(`  ${io.style.yellow('=')} ${f} ${io.style.dim('(existiert, unverändert)')}`);
  const deck = relative(io.cwd, resolve(target, t.deck)) || t.deck;
  io.out(`\n${t.name} angelegt. Weiter mit:\n  forme watch ${deck}`);
  return 0;
}

export function templates(io: Io): number {
  const w = Math.max(...TEMPLATES.map((t) => t.id.length));
  for (const t of TEMPLATES) io.out(`${io.style.bold(t.id.padEnd(w))}  ${t.name} ${io.style.dim(`– ${t.description}`)}`);
  return 0;
}
