// Bundles the CLI into dist/forme.mjs (one file, runs with plain Node >= 20) and copies the templates.
// dist/ is the npm package @k1nggrim/forme; FORME_VERSION (e.g. from a release tag) sets its version.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const dist = join(pkg, 'dist');
const examples = resolve(pkg, '../../examples');
const version = (process.env.FORME_VERSION || JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8')).version).replace(/^v/, '');

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
  define: { 'process.env.FORME_VERSION': JSON.stringify(version) },
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
      name: '@k1nggrim/forme',
      version,
      description: 'Forme: Präsentationen als Code – Kommandozeile (compile, watch, check, init)',
      type: 'module',
      bin: { forme: 'forme.mjs' },
      files: ['forme.mjs', 'forme.mjs.LEGAL.txt', 'templates'],
      engines: { node: '>=20' },
      dependencies: { 'playwright-core': '1.56.1' },
      keywords: ['presentation', 'slides', 'pdf', 'pptx', 'forme'],
      homepage: 'https://k1nggrim.github.io/forme/docs/',
      repository: { type: 'git', url: 'git+https://github.com/K1ngGrim/forme.git' },
      publishConfig: { access: 'public' },
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  join(dist, 'README.md'),
  `# Forme – Kommandozeile

Präsentationen als Code: \`forme compile\`, \`forme watch\`, \`forme check\`, \`forme init\`, \`forme migrate\`.

\`\`\`
npm install -g @k1nggrim/forme
forme init vortrag
forme watch vortrag/deck.forme
\`\`\`

Dokumentation: https://k1nggrim.github.io/forme/docs/
`,
);
console.log(`@k1nggrim/forme ${version}: dist/forme.mjs + templates → ${dist}`);
