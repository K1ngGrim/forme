import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { code, objectCenter, openTemplate } from './helpers';

test.describe('Forme im Browser', () => {
  test('editor and file stay in sync', async ({ page }) => {
    await openTemplate(page, 'quartalsbericht');
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
  });

  test('literal moves, text editing, command line and errors', async ({ page }) => {
    await openTemplate(page, 'quartalsbericht');
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
  });

  test('create, delete and persist in the browser', async ({ page }) => {
    await openTemplate(page, 'quartalsbericht', 'Persistenz');
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
    await expect(page.locator('[data-testid="save-state"]')).toHaveText('Im Browser gespeichert');
    // reload: the project is restored from IndexedDB
    await page.reload();
    await page.waitForSelector('.slide-svg g[data-id]');
    await expect.poll(() => code(page)).toContain('hide @pagenum');
    await page.click('[data-testid="projects"]');
    await expect(page.locator('[data-testid="project-Persistenz"]')).toBeVisible();
  });

  test('exports PPTX, prints PDF and round-trips a ZIP', async ({ page }) => {
    await openTemplate(page, 'hka-seminar', 'Export');
    const pptx = page.waitForEvent('download');
    await page.selectOption('[data-testid="export"]', 'pptx');
    const file = await (await pptx).path();
    expect(readFileSync(file).subarray(0, 2).toString()).toBe('PK');

    // PDF goes through the print dialog of a hidden frame with all pages
    await page.evaluate(() => {
      const w = window as unknown as { printed: number };
      w.printed = 0;
      new MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes) {
            if (n instanceof HTMLIFrameElement) {
              n.addEventListener('load', () => {
                const cw = n.contentWindow as Window;
                cw.print = () => {
                  w.printed = cw.document.querySelectorAll('.page').length;
                };
              });
            }
          }
      }).observe(document.body, { childList: true });
    });
    await page.selectOption('[data-testid="export"]', 'pdf');
    await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(7);

    // ZIP download and import as a new project
    const zip = page.waitForEvent('download');
    await page.selectOption('[data-testid="file-menu"]', 'zip');
    const zipPath = await (await zip).path();
    await page.click('[data-testid="projects"]');
    await page.setInputFiles('[data-testid="import-zip"]', { name: 'Kopie.zip', mimeType: 'application/zip', buffer: readFileSync(zipPath) });
    await page.waitForSelector('[data-testid="project-dialog"]', { state: 'detached' });
    await expect(page.locator('[data-testid="status-bar"]')).toContainText('Kopie');
    await expect(page.locator('.slide-svg g[data-id="title"]')).toContainText('Offene und Programmierbare');
  });

  test('theme mode edits the theme file', async ({ page }) => {
    await openTemplate(page, 'quartalsbericht');
    await page.click('[data-testid="slide-kpis"]');
    await page.click('[data-testid="theme-mode"]');
    await expect.poll(() => code(page)).toContain('theme "Corporate"');
    const t = await objectCenter(page, 'title');
    await page.mouse.click(t.x, t.y);
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => code(page)).toContain('slot @title style=h1 x=$margin y=$margin w=(slide.w-2*$margin)\n  set @title y=121');
  });

  test('edits a folder on disk: save and external changes', async ({ page }) => {
    // stand-in for the folder picker: a directory in the origin private file system
    await page.addInitScript(() => {
      (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle('vortrag', { create: true });
      };
    });
    await page.goto('/');
    await page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('vortrag', { create: true });
      const write = async (name: string, text: string): Promise<void> => {
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await w.write(text);
        await w.close();
      };
      await write('deck.forme', 'deck "Ordner"\n\nslide @a layout=content\n  fill @title "Aus dem Ordner"\n  rect @box x=100 y=300 w=400 h=200\n');
    });
    await page.getByText('Ordner auf dem Rechner öffnen').click();
    await page.waitForSelector('[data-testid="project-dialog"]', { state: 'detached' });
    await expect(page.locator('.slide-svg g[data-id="title"]')).toContainText('Aus dem Ordner');

    const read = (): Promise<string> =>
      page.evaluate(async () => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('vortrag');
        // a snapshot becomes unreadable if the app touches the file meanwhile: retry
        for (let i = 0; ; i++) {
          try {
            return await (await (await dir.getFileHandle('deck.forme')).getFile()).text();
          } catch (e) {
            if (i > 20) throw e;
            await new Promise((r) => setTimeout(r, 50));
          }
        }
      });

    // edits stay in memory until Ctrl+S
    await page.locator('.cm-line', { hasText: 'rect @box' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' fill=#FF0000');
    await expect(page.locator('[data-testid="save-state"]')).toContainText('Ungespeichert');
    expect(await read()).not.toContain('#FF0000');
    await page.keyboard.press('Control+s');
    await expect.poll(read).toContain('rect @box x=100 y=300 w=400 h=200 fill=#FF0000');

    // a change made by another program shows up in the editor
    await page.evaluate(async () => {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('vortrag');
      const w = await (await dir.getFileHandle('deck.forme')).createWritable();
      await w.write('deck "Ordner"\n\nslide @a layout=content\n  fill @title "Extern geändert"\n');
      await w.close();
    });
    await expect(page.locator('.slide-svg g[data-id="title"]')).toContainText('Extern geändert', { timeout: 10_000 });
    await expect.poll(() => code(page)).toContain('fill @title "Extern geändert"');
  });
});
