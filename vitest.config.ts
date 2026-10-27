import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/vscode/test/**/*.test.ts', 'apps/web/test/unit/**/*.test.ts'],
  },
});
