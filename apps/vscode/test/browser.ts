import type { Browser } from 'playwright-core';
import { chromium } from 'playwright-core';

/**
 * Chromium for the webview tests: Playwright's own build, otherwise an installed Chrome.
 * Null when neither exists (the tests are skipped then). CI installs Playwright's Chromium.
 */
export async function launchBrowser(): Promise<Browser | null> {
  for (const opts of [{}, { channel: 'chrome' }]) {
    const browser = await chromium.launch({ ...opts, timeout: 45_000 }).catch(() => null);
    if (browser) return browser;
  }
  return null;
}

/** Hook timeout for tests that start a browser (a cold start on CI can take a while). */
export const BROWSER_HOOK_TIMEOUT = 120_000;
