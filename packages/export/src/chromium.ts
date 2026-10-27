import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser, LaunchOptions } from 'playwright-core';
import { chromium } from 'playwright-core';
import type { HtmlPrinter } from './pdf.js';

/**
 * Headless Chromium for Node (CLI, VS Code): PDF printing and rasterizing.
 * Tries, in order: an explicit path (option or FORME_CHROMIUM), Playwright's own Chromium,
 * an installed Google Chrome, an installed Microsoft Edge.
 */
export class ChromiumSession {
  private browser: Browser | null = null;

  constructor(private readonly options: { executablePath?: string } = {}) {}

  private async open(): Promise<Browser> {
    if (this.browser) return this.browser;
    const executablePath = this.options.executablePath || process.env.FORME_CHROMIUM;
    const attempts: LaunchOptions[] = executablePath ? [{ executablePath }] : [{}, { channel: 'chrome' }, { channel: 'msedge' }];
    let first: Error | null = null;
    for (const opts of attempts) {
      try {
        this.browser = await chromium.launch(opts);
        return this.browser;
      } catch (e) {
        first ??= e as Error;
      }
    }
    throw new Error(
      `Kein Chromium gefunden (${(first?.message ?? '').split('\n')[0]}). ` +
        'Google Chrome oder Microsoft Edge installieren, „npx playwright install chromium“ ausführen oder den Pfad per FORME_CHROMIUM setzen.',
    );
  }

  readonly print: HtmlPrinter = async (html, size) => {
    const browser = await this.open();
    const dir = await mkdtemp(join(tmpdir(), 'forme-pdf-'));
    try {
      const file = join(dir, 'deck.html');
      await writeFile(file, html, 'utf8');
      const page = await browser.newPage();
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const pdf = await page.pdf({ width: `${size.width}px`, height: `${size.height}px`, printBackground: true, preferCSSPageSize: true });
      await page.close();
      return new Uint8Array(pdf);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  readonly rasterize = async (svg: string, width: number, height: number): Promise<Uint8Array> => {
    const browser = await this.open();
    const page = await browser.newPage({ viewport: { width: Math.ceil(width), height: Math.ceil(height) } });
    const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg style="display:block;width:${width}px;height:${height}px" `)}</body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
    await page.close();
    return new Uint8Array(png);
  };

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}
