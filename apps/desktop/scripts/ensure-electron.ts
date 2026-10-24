import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * Make sure the Electron binary is installed. Package managers may skip Electron's
 * postinstall script (e.g. pnpm when build scripts were not yet approved at install time),
 * which leaves the package without its binary ("Electron uninstall").
 */
const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('electron/package.json'));
const pathFile = join(pkgDir, 'path.txt');

function installed(): boolean {
  if (!existsSync(pathFile)) return false;
  const rel = readFileSync(pathFile, 'utf8').trim();
  return rel.length > 0 && existsSync(join(pkgDir, 'dist', rel));
}

if (!installed()) {
  console.log('Electron-Binary fehlt – wird heruntergeladen …');
  try {
    execFileSync(process.execPath, [join(pkgDir, 'install.js')], { cwd: pkgDir, stdio: 'inherit', env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '' } });
  } catch {
    // reported below
  }
  if (!installed()) {
    console.error(
      'Electron konnte nicht installiert werden. Bitte Netzwerk/Proxy prüfen und erneut versuchen,\n' +
        `oder manuell ausführen: node "${join(pkgDir, 'install.js')}"`,
    );
    process.exit(1);
  }
  console.log('Electron installiert.');
}
