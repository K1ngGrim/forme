import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1600, height: 1000 }, acceptDownloads: true },
  webServer: { command: 'pnpm exec vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
});
