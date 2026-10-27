/** Parsed command line: a command, positional arguments and --options. */
export interface Args {
  command: string | null;
  positional: string[];
  options: Record<string, string | true>;
}

/** Options that take a value (`--slide intro` or `--slide=intro`). */
const VALUE_OPTIONS = new Set(['out', 'o', 'slide', 'format', 'f', 'template', 't', 'chromium']);

const ALIASES: Record<string, string> = { o: 'out', f: 'format', t: 'template', h: 'help', v: 'version' };

export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const options: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    const m = /^--?([\w-]+)(?:=(.*))?$/.exec(a);
    if (!m || a === '-') {
      positional.push(a);
      continue;
    }
    const raw = m[1] as string;
    const name = ALIASES[raw] ?? raw;
    if (m[2] !== undefined) options[name] = m[2];
    else if (VALUE_OPTIONS.has(raw) && i + 1 < argv.length) options[name] = argv[++i] as string;
    else options[name] = true;
  }
  return { command: positional.shift() ?? null, positional, options };
}

export function stringOption(args: Args, name: string): string | undefined {
  const v = args.options[name];
  return typeof v === 'string' ? v : undefined;
}
