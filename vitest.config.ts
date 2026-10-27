import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // the VS Code API only exists inside VS Code; tests use an in-memory stand-in
    alias: { vscode: fileURLToPath(new URL('./apps/vscode/test/mock-vscode.ts', import.meta.url)) },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/vscode/test/**/*.test.ts', 'apps/web/test/unit/**/*.test.ts'],
  },
});
