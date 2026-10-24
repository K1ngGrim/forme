import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
export const examples = resolve(here, '../../../../examples');

/** Copy the examples into a temp dir so tests can save without touching the repo. */
export function tempExamples(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forme-e2e-'));
  cpSync(examples, dir, { recursive: true });
  return dir;
}

export async function launch(file: string | null, env: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [resolve(here, '../../out/main/index.js'), ...(process.env.CI || process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, FORME_E2E: '1', ...(file ? { FORME_OPEN: file } : {}), ...env } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="canvas"]');
  return { app, page };
}
