import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { launch, tempExamples } from './helpers';

async function code(page: Page): Promise<string> {
  return page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.cm-content .cm-line'));
    return lines.map((l) => l.textContent ?? '').join('\n');
  });
}

/** Center of an object on the canvas in page coordinates. */
async function objectCenter(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`.slide-svg g[data-id="${id}"]`).boundingBox();
  if (!box) throw new Error(`no object ${id}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('Forme desktop', () => {
  test('editor and file stay in sync', async () => {
    const dir = tempExamples();
    const { app, page } = await launch(join(dir, 'deck.forme'));
    await page.click('[data-testid="slide-kpis"]');

    // click selects the object and highlights its ops in the code
    const c = await objectCenter(page, 'card3');
    await page.mouse.click(c.x, c.y);
    await expect(page.locator('.cm-forme-selected').first()).toBeVisible();
    await expect(page.locator('[data-testid="insp-id"]')).toHaveValue('card3');

    // drag: card3.x comes from `distribute` (semantic) -> a set line is inserted after `align`
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.keyboard.down('Control'); // no snapping
    await page.mouse.move(c.x + 20, c.y + 60, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect.poll(() => code(page)).toMatch(/align top @card1 @card2 @card3\n\s+set @card3 x=\d+ y=\d+/);

    // undo restores the original text (one step)
    await page.keyboard.press('Control+z');
    await expect.poll(() => code(page)).not.toContain('set @card3');

    // editing the code updates the canvas
    const before = await page.locator('.slide-svg g[data-id="card1"] rect').getAttribute('width');
    expect(before).toBe('520');
    await page.click('.cm-content');
    await page.keyboard.press('Control+f');
    await page.keyboard.press('Escape');
    const line = page.locator('.cm-line', { hasText: 'rect @card1' });
    await line.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' stroke=#000000');
    await expect(page.locator('.slide-svg g[data-id="card1"] rect')).toHaveAttribute('stroke', '#000000');

    // cursor in an op selects the object on the canvas
    await page.locator('.cm-line', { hasText: 'text @kpi1' }).click();
    await expect(page.locator('[data-testid="insp-id"]')).toHaveValue('kpi1');
    await app.close();
  });

  test('literal moves, text editing, command line and errors', async () => {
    const dir = tempExamples();
    const { app, page } = await launch(join(dir, 'deck.forme'));
    await page.click('[data-testid="slide-details"]');

    // literal on the slide is replaced in place (rule 1)
    const a = await objectCenter(page, 'tbl');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.keyboard.down('Control');
    await page.mouse.move(a.x - 40, a.y, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up('Control');
    await expect.poll(() => code(page)).toMatch(/table @tbl x=(?!1100 )\d+ y=260 w=700/);
    expect(await code(page)).not.toContain('set @tbl');

    // command line appends an op to the slide
    await page.click('[data-testid="command-line"]');
    await page.keyboard.type('rect @neu x=100 y=900 w=200 h=80 fill=#FF0000');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect(page.locator('.slide-svg g[data-id="neu"]')).toBeVisible();
    expect(await code(page)).toContain('  rect @neu x=100 y=900 w=200 h=80 fill=#FF0000');

    // double click edits text inline
    const t = await objectCenter(page, 'title');
    await page.mouse.dblclick(t.x, t.y);
    const editor = page.locator('[data-testid="inline-editor"]');
    await expect(editor).toBeVisible();
    await editor.fill('Neuer Titel – {section}');
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => code(page)).toContain('fill @title "Neuer Titel – {section}"');
    await expect(page.locator('.slide-svg g[data-id="title"]')).toContainText('Neuer Titel – Zahlen');

    // a parse error keeps the last good state visible and marks it stale
    await page.locator('.cm-line', { hasText: 'rect @neu' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' x=(1 +');
    await expect(page.locator('.stale-badge')).toBeVisible();
    await expect(page.locator('.slide-svg g[data-id="neu"]')).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(page.locator('.stale-badge')).toHaveCount(0);
    await app.close();
  });

  test('create, delete and save', async () => {
    const dir = tempExamples();
    const file = join(dir, 'deck.forme');
    const { app, page } = await launch(file);
    await page.click('[data-testid="slide-kpis"]');
    await page.click('[data-testid="tool-ellipse"]');
    const stage = await page.locator('.canvas-stage').boundingBox();
    if (!stage) throw new Error('no stage');
    await page.mouse.move(stage.x + stage.width * 0.7, stage.y + stage.height * 0.65);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width * 0.85, stage.y + stage.height * 0.85, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => code(page)).toMatch(/ellipse @ellipse1 x=\d+ y=\d+ w=\d+ h=\d+/);
    await page.keyboard.press('Delete');
    await expect.poll(() => code(page)).not.toContain('@ellipse1');
    // delete a master object -> hide op
    const p = await objectCenter(page, 'pagenum');
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('Delete');
    await expect.poll(() => code(page)).toContain('hide @pagenum');
    await page.keyboard.press('Control+s');
    await expect.poll(() => readFileSync(file, 'utf8')).toContain('hide @pagenum');
    await app.close();
  });

  test('exports PDF and PPTX', async () => {
    const dir = tempExamples();
    const out = join(dir, 'export');
    const { app, page } = await launch(join(dir, 'deck.forme'), { FORME_EXPORT_PATH: out });
    await page.selectOption('[data-testid="export"]', 'pdf');
    await expect.poll(() => existsSync(`${out}.pdf`), { timeout: 30_000 }).toBe(true);
    await page.selectOption('[data-testid="export"]', 'pptx');
    await expect.poll(() => existsSync(`${out}.pptx`), { timeout: 30_000 }).toBe(true);
    expect(readFileSync(`${out}.pdf`).subarray(0, 4).toString()).toBe('%PDF');
    await app.close();
  });

  test('theme mode edits the theme file', async () => {
    const dir = tempExamples();
    const { app, page } = await launch(join(dir, 'deck.forme'));
    await page.click('[data-testid="slide-kpis"]');
    await page.click('[data-testid="theme-mode"]');
    await expect.poll(() => code(page)).toContain('theme "Corporate"');
    const t = await objectCenter(page, 'title');
    await page.mouse.click(t.x, t.y);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => code(page)).toContain('slot @title style=h1 x=$margin y=$margin w=(slide.w-2*$margin)\n  set @title y=121');
    await app.close();
  });
});
