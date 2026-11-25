import type { Locator, Page } from '@playwright/test';
import { fileMarksPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// Marks the file arrived with, end to end (docs/specs/035-pdf-documents/marks.md "Changing a mark"): a press selects
// one, a drag moves it and the page is drawn without the file's own, LiveDoc drawing it where it went; undo gives the
// file's own back; Delete takes one away. The fixture's page is 612 by 792 points.

/** A point of page one, in page space, on screen. */
async function onScreen(first: Locator, x: number, y: number): Promise<[number, number]> {
  const box = (await first.boundingBox())!;
  return [box.x + (box.width * x) / 612, box.y + box.height * (1 - y / 792)];
}

/** Whether page one's picture is inked, not paper, at a point of page space. */
async function pictureInked(page: Page, x: number, y: number): Promise<boolean> {
  return page.locator(`${PAGE_ONE} canvas`).first().evaluate(
    (canvas: HTMLCanvasElement, [px, py]) => {
      const at = canvas
        .getContext('2d')!
        .getImageData(Math.round(px * canvas.width), Math.round(py * canvas.height), 1, 1).data;
      return at[0]! + at[1]! + at[2]! < 600;
    },
    [x / 612, 1 - y / 792] as const,
  );
}

test('a mark the file arrived with is selected, moved, given back by undo and deleted', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  await dropPdf(page, 'Their marks.pdf', fileMarksPdf());
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  await expect(first).toHaveAttribute('data-pdf-file-marks', 'their-box o:5');
  const outlines = page.locator(`${PAGE_ONE} [data-pdf-mark-outline]`);
  const drawnHere = page.locator(`${PAGE_ONE} [data-pdf-mark]`);
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('v');

  // The picture draws both; LiveDoc draws neither, yet each is a control of its own.
  expect(await pictureInked(page, 102, 650)).toBe(true);
  await expect(drawnHere).toHaveCount(0);
  const box = page.getByRole('button', { name: 'Rectangle by Grace' });
  await expect(box).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Drawing by Grace' })).toHaveCount(1);

  // A press on the box's line selects it; a drag moves it, drawn by LiveDoc, the file's own drawn no more.
  await page.mouse.click(...(await onScreen(first, 102, 650)));
  await expect(outlines).toHaveCount(1);
  await expect(box).toHaveAttribute('aria-pressed', 'true');
  const [x, y] = await onScreen(first, 102, 650);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(...(await onScreen(first, 302, 620)), { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(`${PAGE_ONE} [data-pdf-mark="their-box"]`)).toHaveCount(1);
  await expect.poll(() => pictureInked(page, 102, 650)).toBe(false);
  expect(await pictureInked(page, 150, 555)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('pdf-file-mark-moved.png') });

  // Undo gives the file's own back, as the file draws it.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(drawnHere).toHaveCount(0);
  await expect.poll(() => pictureInked(page, 102, 650)).toBe(true);

  // The Drawing selected and deleted: the page is drawn without it.
  await page.mouse.click(...(await onScreen(first, 150, 555)));
  await expect(page.getByRole('button', { name: 'Drawing by Grace' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Delete');
  await expect.poll(() => pictureInked(page, 150, 555)).toBe(false);
  await expect(page.getByRole('button', { name: 'Drawing by Grace' })).toHaveCount(0);
  expect(await pictureInked(page, 102, 650)).toBe(true);
  expectNoPageErrors(pageErrors);
});
