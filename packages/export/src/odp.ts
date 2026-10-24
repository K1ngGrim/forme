import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  'soffice',
  'libreoffice',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/opt/libreoffice/program/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

function run(cmd: string, args: string[], timeout = 120_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((res) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => res({ ok: !err, out: `${stdout}${stderr}` }));
  });
}

let cached: string | null | undefined;

/** Locate a LibreOffice binary, or null when it is not installed. */
export async function findSoffice(): Promise<string | null> {
  if (cached !== undefined) return cached;
  for (const c of CANDIDATES) {
    if (c.includes('/') || c.includes('\\')) {
      try {
        await access(c);
        cached = c;
        return c;
      } catch {
        continue;
      }
    }
    const r = await run(c, ['--version'], 20_000);
    if (r.ok) {
      cached = c;
      return c;
    }
  }
  cached = null;
  return null;
}

/** Convert PPTX bytes to ODP with LibreOffice headless. */
export async function pptxToOdp(pptx: Uint8Array): Promise<Uint8Array> {
  const soffice = await findSoffice();
  if (!soffice) throw new Error('LibreOffice ist nicht installiert – ODP-Export nicht verfügbar');
  const dir = await mkdtemp(join(tmpdir(), 'forme-odp-'));
  try {
    const input = join(dir, 'deck.pptx');
    await writeFile(input, pptx);
    // separate profile dir so a running LibreOffice instance does not block the conversion
    const profile = `-env:UserInstallation=file://${dir.replace(/\\/g, '/')}/profile`;
    const r = await run(soffice, [profile, '--headless', '--convert-to', 'odp', '--outdir', dir, input]);
    try {
      return new Uint8Array(await readFile(join(dir, 'deck.odp')));
    } catch {
      throw new Error(`Konvertierung fehlgeschlagen: ${r.out.trim()}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
