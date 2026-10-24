import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Starts electron-vite with an explicit Electron binary.
 *
 * electron-vite resolves `electron` from its own location inside the pnpm store, which can
 * hit a copy without the downloaded binary ("Electron uninstall"), and pnpm may skip
 * Electron's postinstall script altogether. Here the binary is resolved from this app,
 * downloaded if missing, and passed on via ELECTRON_EXEC_PATH.
 */
const require = createRequire(import.meta.url);
const electronDir = dirname(require.resolve('electron/package.json'));

function binary(): string | null {
  const pathFile = join(electronDir, 'path.txt');
  if (!existsSync(pathFile)) return null;
  const exe = join(electronDir, 'dist', readFileSync(pathFile, 'utf8').trim());
  return existsSync(exe) ? exe : null;
}

let exe = binary();
if (!exe) {
  console.log(`Electron-Binary fehlt in ${electronDir} – wird heruntergeladen …`);
  try {
    execFileSync(process.execPath, [join(electronDir, 'install.js')], {
      cwd: electronDir,
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '' },
    });
  } catch {
    // reported below
  }
  exe = binary();
  if (!exe) {
    console.error(`Electron konnte nicht installiert werden. Manuell versuchen mit:\n  node "${join(electronDir, 'install.js')}"`);
    process.exit(1);
  }
}

const cli = join(dirname(require.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_EXEC_PATH: exe },
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
