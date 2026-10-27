// Builds the extension: dist/extension.cjs (Node, VS Code host), dist/preview.js (webview),
// dist/editor (the web app's editor, shown as custom editor),
// dist/templates (for "Neue Präsentation aus Vorlage") and dist/node_modules/playwright-core (PDF).
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const dist = join(pkg, 'dist');
const examples = resolve(pkg, '../../examples');
const watch = process.argv.includes('--watch');

await rm(dist, { recursive: true, force: true });
const common = { bundle: true, minify: !watch, sourcemap: watch ? 'inline' : false, logLevel: 'warning', legalComments: 'none' };
await build({
  ...common,
  entryPoints: [join(pkg, 'src/extension.ts')],
  outfile: join(dist, 'extension.cjs'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // vscode is provided by the host; playwright-core loads its own files and is copied below
  external: ['vscode', 'playwright-core'],
});
await build({ ...common, entryPoints: [join(pkg, 'media/preview.ts')], outfile: join(dist, 'preview.js'), platform: 'browser', format: 'iife', target: 'es2022' });

// the full editor: the web app, built as is (it detects VS Code at runtime)
const web = resolve(pkg, '../web');
const vite = join(dirname(createRequire(join(web, 'package.json')).resolve('vite/package.json')), 'bin/vite.js');
execFileSync(process.execPath, [vite, 'build', '--outDir', join(dist, 'editor'), '--emptyOutDir', '--logLevel', 'warn'], { cwd: web, stdio: 'inherit' });

async function copyExamples(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(examples, p);
    if (rel === '__golden__') continue;
    if (e.isDirectory()) await copyExamples(p);
    else {
      await mkdir(dirname(join(dist, 'templates', rel)), { recursive: true });
      await cp(p, join(dist, 'templates', rel));
    }
  }
}
await copyExamples(examples);

const require = createRequire(join(pkg, 'package.json'));
const pw = await realpath(dirname(require.resolve('playwright-core/package.json')));
await cp(pw, join(dist, 'node_modules', 'playwright-core'), { recursive: true, dereference: true });
console.log('dist/extension.cjs, dist/preview.js, dist/editor, dist/templates, dist/node_modules/playwright-core');
