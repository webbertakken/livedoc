import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// The Drawing end to end (docs/specs/035-pdf-documents/marks.md "Making a mark": A Drawing, "In the file";
// keyboard-shortcuts.md "Tools"): D takes the tool; two strokes in a row are one Drawing, a stroke after a pause another;
// undo takes back the last stroke; the download holds each Drawing as an Ink annotation.

/** A stroke dragged across page one, from and to points given as fractions of its box, kept within the
 * window: the page runs on below it. */
async function stroke(page: Page, first: Locator, from: [number, number], to: [number, number]) {
  const box = (await first.boundingBox())!;
  const point = ([x, y]: [number, number]) =>
    [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...point(from));
  await page.mouse.down();
  await page.mouse.move(...point([(from[0] + to[0]) / 2, from[1] - 0.02]), { steps: 5 });
  await page.mouse.move(...point(to), { steps: 5 });
  await page.mouse.up();
}

test('strokes drawn on a page are Drawings, joined in a run, undone a stroke at a time, and leave as Ink', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Sketch.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const drawings = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="drawing"]`);
  const strokes = (at: number) => drawings.nth(at).locator('polyline');

  // D takes the Drawing tool; the toolbar's Drawing shows it pressed.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('d');
  await expect(page.locator('[data-pdf-tool]')).toHaveAttribute('data-pdf-tool', 'drawing');
  await expect(page.getByRole('button', { name: 'Drawing', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Two strokes in a row: one Drawing of two strokes.
  await stroke(page, first, [0.2, 0.25], [0.4, 0.28]);
  await stroke(page, first, [0.2, 0.32], [0.4, 0.35]);
  await expect(drawings).toHaveCount(1);
  await expect(strokes(0)).toHaveCount(2);
  await expect(strokes(0).first()).toHaveAttribute('stroke-linecap', 'round');

  // After a pause past PDF_DRAWING_JOIN_MS, a Drawing of its own.
  await page.waitForTimeout(1_200);
  await stroke(page, first, [0.5, 0.38], [0.7, 0.41]);
  await expect(drawings).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('pdf-drawing.png') });

  // Undo takes back the last stroke; a second undo the joined stroke, leaving the first Drawing with one.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(drawings).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(strokes(0)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(strokes(0)).toHaveCount(2);

  // Downloaded: a valid PDF holding the Drawing as an Ink annotation, appended to the file.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-drawing-')), 'Sketch.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  expect(added).toContain('/Ink');
  expect(added).toContain('/InkList');
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});
