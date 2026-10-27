import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../src/args.js';
import type { Io } from '../src/commands.js';
import { run } from '../src/main.js';
import { formatDiagnostic } from '../src/report.js';

let dir = '';
let lines: string[] = [];
const io = (): Io => ({ cwd: dir, out: (l) => lines.push(l), err: (l) => lines.push(l), style: { red: String, yellow: String, blue: String, green: String, dim: String, bold: String } });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'forme-cli-'));
  lines = [];
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

async function until(cond: () => Promise<boolean>, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error(`timeout; output:\n${lines.join('\n')}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('args', () => {
  it('parses commands, positionals, aliases and values', () => {
    expect(parseArgs(['compile', 'a.forme', 'b.pdf', '-f', 'svg', '--slide=intro', '--json'])).toEqual({
      command: 'compile',
      positional: ['a.forme', 'b.pdf'],
      options: { format: 'svg', slide: 'intro', json: true },
    });
  });
});

describe('diagnostics', () => {
  it('prints a code frame', () => {
    const src = 'slide @a\n  rect @r like=@nope\n';
    const start = src.indexOf('@nope');
    const text = formatDiagnostic({ severity: 'error', message: 'Unbekanntes Objekt', span: { start, end: start + 5 } }, 'deck.forme', src);
    expect(text).toBe(['Fehler: Unbekanntes Objekt', '  ┌─ deck.forme:2:16', '2 │   rect @r like=@nope', '  │                ^^^^^'].join('\n'));
  });
});

describe('commands', () => {
  it('init + check + compile to svg and html', async () => {
    expect(await run(['init', 'p', '--template', 'guide'], io())).toBe(0);
    expect(await run(['check', 'p/deck.forme'], io())).toBe(0);
    expect(await run(['compile', 'p/deck.forme', 'out/slide-{n}.svg'], io())).toBe(0);
    expect(await readFile(join(dir, 'out/slide-1.svg'), 'utf8')).toMatch(/^<svg /);
    expect(await run(['compile', 'p/deck.forme', '-f', 'html'], io())).toBe(0);
    expect(await readFile(join(dir, 'p/deck.html'), 'utf8')).toContain('class="page"');
  });

  it('init never overwrites', async () => {
    await writeFile(join(dir, 'deck.forme'), 'deck "Meins"\n');
    expect(await run(['init'], io())).toBe(0);
    expect(await readFile(join(dir, 'deck.forme'), 'utf8')).toBe('deck "Meins"\n');
  });

  it('check fails on errors and writes nothing on compile', async () => {
    await writeFile(join(dir, 'deck.forme'), 'deck "X"\n\nslide @a\n  rect @r like=@nope\n');
    expect(await run(['check', 'deck.forme', '--json'], io())).toBe(1);
    expect(JSON.parse(lines.join('\n')).diagnostics[0]).toMatchObject({ severity: 'error', line: 4, column: 16 });
    expect(await run(['compile', 'deck.forme', 'x.html'], io())).toBe(1);
    await expect(readFile(join(dir, 'x.html'))).rejects.toThrow();
  });

  it('unknown command and format', async () => {
    expect(await run(['nope'], io())).toBe(1);
    await writeFile(join(dir, 'deck.forme'), 'deck "X"\n');
    expect(await run(['compile', 'deck.forme', 'x.doc'], io())).toBe(1);
    expect(lines.join('\n')).toContain('Unbekanntes Ausgabeformat');
  });

  it('watch recompiles when the deck or the theme changes', async () => {
    await writeFile(join(dir, 'theme.forme'), 'theme "T"\ncolor primary #112233\n');
    await writeFile(join(dir, 'deck.forme'), 'deck "X"\ntheme "./theme.forme"\n\nslide @a\n  rect @r x=0 y=0 w=100 h=100 fill=$primary\n');
    const abort = new AbortController();
    const done = run(['watch', 'deck.forme', 'out.html'], io(), abort.signal);
    const html = (): Promise<string> => readFile(join(dir, 'out.html'), 'utf8').catch(() => '');
    await until(async () => (await html()).includes('#112233'));
    await writeFile(join(dir, 'theme.forme'), 'theme "T"\ncolor primary #445566\n');
    await until(async () => (await html()).includes('#445566'));
    await writeFile(join(dir, 'deck.forme'), 'deck "X"\ntheme "./theme.forme"\n\nslide @a\n  rect @r x=0 y=0 w=100 h=100 fill=#778899\n');
    await until(async () => (await html()).includes('#778899'));
    abort.abort();
    expect(await done).toBe(0);
  });
});
