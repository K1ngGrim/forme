import type { Page } from '@playwright/test';

/** Create a browser project from a bundled template and wait for the editor. */
export async function openTemplate(page: Page, template: string, name = 'Testprojekt'): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[data-testid="project-dialog"]');
  page.once('dialog', (d) => void d.accept(name));
  await page.click(`[data-testid="template-${template}"]`);
  await page.waitForSelector('[data-testid="project-dialog"]', { state: 'detached' });
  await page.waitForSelector('.slide-svg g[data-id]');
}

export async function code(page: Page): Promise<string> {
  return page.evaluate(() => Array.from(document.querySelectorAll('.cm-content .cm-line')).map((l) => l.textContent ?? '').join('\n'));
}

/** Center of an object on the canvas in page coordinates. */
export async function objectCenter(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`.slide-svg g[data-id="${id}"]`).boundingBox();
  if (!box) throw new Error(`no object ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
