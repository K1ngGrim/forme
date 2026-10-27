// Bundles the CLI into dist/forme.mjs (one file, runs with plain Node >= 20) and copies the templates.
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const dist = join(pkg, 'dist');
const examples = resolve(pkg, '../../examples');

await rm(dist, { recursive: true, force: true });
await build({
  entryPoints: [join(pkg, 'src/main.ts')],
  outfile: join(dist, 'forme.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: true,
  legalComments: 'linked',
  // playwright-core is large and loads its own files at runtime: installed next to the bundle
  external: ['playwright-core'],
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

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

await writeFile(
  join(dist, 'package.json'),
  JSON.stringify(
    {
      name: 'forme-cli',
      version: '0.1.0',
      description: 'Forme: Präsentationen als Code – Kommandozeile',
      type: 'module',
      bin: { forme: 'forme.mjs' },
      engines: { node: '>=20' },
      dependencies: { 'playwright-core': '1.56.1' },
    },
    null,
    2,
  ) + '\n',
);
console.log(`dist/forme.mjs + templates → ${dist}`);
