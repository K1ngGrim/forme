import { parseArgs } from './args.js';
import type { Args } from './args.js';
import { check, compile, init, templates, watch } from './commands.js';
import type { Io } from './commands.js';
import { COLORS, PLAIN } from './report.js';

export const VERSION = '0.1.0';

export const USAGE = `Forme ${VERSION} – Präsentationen als Code

Verwendung:
  forme compile <deck.forme> [ausgabe]   Präsentation erzeugen (Standard: <deck>.pdf)
  forme watch <deck.forme> [ausgabe]     wie compile, bei jeder Änderung neu
  forme check <deck.forme> [--json]      nur Fehler und Warnungen ausgeben
  forme init [ordner] [--template <id>]  neues Projekt anlegen (Standard: leer)
  forme templates                        verfügbare Vorlagen auflisten

Ausgabeformate (nach Dateiendung oder --format):
  .pdf   wie der Druck aus der App (braucht Chrome, Edge oder Chromium)
  .pptx  in PowerPoint editierbar     .odp   über LibreOffice (soffice)
  .html  eine Seite pro Folie          .svg   eine Folie; „{n}“ im Namen = alle Folien

Optionen:
  -o, --out <datei>      Ausgabedatei (statt des zweiten Arguments)
  -f, --format <fmt>     pdf, pptx, odp, html oder svg
      --slide <id>       nur diese Folie (SVG)
      --chromium <pfad>  Browser für PDF (sonst FORME_CHROMIUM, Playwright, Chrome, Edge)
      --no-color         ohne Farben
  -h, --help             diese Hilfe
  -v, --version          Version`;

/** Run one CLI invocation. Returns the exit code; never calls process.exit. */
export async function run(argv: string[], io: Io, signal: AbortSignal = new AbortController().signal): Promise<number> {
  const args: Args = parseArgs(argv);
  if (args.options.version) {
    io.out(VERSION);
    return 0;
  }
  if (args.options.help || !args.command || args.command === 'help') {
    io.out(USAGE);
    return args.command || args.options.help ? 0 : 1;
  }
  try {
    switch (args.command) {
      case 'compile':
      case 'c':
      case 'render': // older name, kept for scripts
        return await compile(args, io);
      case 'watch':
      case 'w':
        return await watch(args, io, signal);
      case 'check':
        return await check(args, io);
      case 'init':
        return await init(args, io);
      case 'templates':
        return templates(io);
      default:
        io.err(`Unbekannter Befehl „${args.command}“\n\n${USAGE}`);
        return 1;
    }
  } catch (e) {
    io.err(`${io.style.red('Fehler')}: ${(e as Error).message}`);
    return 1;
  }
}

const isMain = process.argv[1] && /(?:main\.ts|forme\.mjs|[\\/]forme)$/.test(process.argv[1]);
if (isMain) {
  const argv = process.argv.slice(2);
  const color = !argv.includes('--no-color') && !process.env.NO_COLOR && process.stdout.isTTY;
  const io: Io = {
    // `pnpm forme` runs from the workspace root; resolve paths against the caller's folder
    cwd: process.env.INIT_CWD ?? process.cwd(),
    out: (l) => console.log(l),
    err: (l) => console.error(l),
    style: color ? COLORS : PLAIN,
  };
  const abort = new AbortController();
  process.once('SIGINT', () => abort.abort());
  process.once('SIGTERM', () => abort.abort());
  run(argv, io, abort.signal).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error((e as Error).message);
      process.exit(1);
    },
  );
}
