import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// Stamps end to end (docs/specs/035-pdf-documents/marks.md "Stamps": K takes the Stamp tool; the Stamp control's grid
// by category; a press places the stamp shown; a dynamic stamp's second line; Insert > Stamp's categories; "In the
// file"; keyboard-shortcuts.md "Tools": K): undo takes one back; the download holds each as a Stamp under its name.

/** A press on page one at a point given as fractions of its box, kept within the window. */
async function pressAt(page: Page, first: Locator, [x, y]: [number, number]) {
  const box = (await first.boundingBox())!;
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

test('stamps are placed on a page from the Stamp control and leave as Stamp annotations', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Stamps.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const stamps = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="stamp"]`);
  const tool = page.locator('[data-pdf-tool]');

  // K takes the Stamp tool, Approved at first; the control shows it pressed, and no Colour is offered.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('k');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'stamp');
  const control = page.getByRole('button', { name: 'Stamp: Approved', exact: true });
  await expect(control).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Colour', exact: true })).toHaveCount(0);

  // A press places it there, the tool still in hand.
  await pressAt(page, first, [0.25, 0.12]);
  await expect(stamps.locator('text')).toHaveText('APPROVED');
  await expect(tool).toHaveAttribute('data-pdf-tool', 'stamp');

  // The chevron opens the stamps, a grid a category; Received is taken from it, and placed with who and when.
  await page.getByRole('button', { name: 'Stamp: Approved styles' }).click();
  await expect(page.getByRole('group', { name: 'Standard' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Dynamic' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('pdf-stamp-grid.png') });
  await page.getByRole('menuitemradio', { name: 'Received, with name and time' }).click();
  await expect(
    page.getByRole('button', { name: 'Stamp: Received, with name and time', exact: true }),
  ).toBeVisible();
  await pressAt(page, first, [0.65, 0.22]);
  await expect(stamps).toHaveCount(2);
  const received = stamps.nth(1).locator('text');
  await expect(received.first()).toHaveText('RECEIVED');
  await expect(received.nth(1)).toHaveText(/\d{1,2} \w{3} \d{4}, \d\d:\d\d$/);

  // Insert > Stamp > Standard stamps: with a dynamic stamp shown, the first standard one, Approved.
  await (await officeMenuItem(page, ['Insert', 'Stamp', 'Standard stamps'])).click();
  await expect(control).toBeVisible();
  await page.getByRole('button', { name: 'Stamp: Approved styles' }).click();
  await page.getByRole('menuitemradio', { name: 'Not for public release' }).click();
  await pressAt(page, first, [0.3, 0.34]);
  await expect(stamps).toHaveCount(3);
  await page.screenshot({ path: test.info().outputPath('pdf-stamps.png') });

  // Undo takes the last stamp back; redo places it again.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(stamps).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(stamps).toHaveCount(3);

  // Downloaded: a valid PDF holding each as a Stamp under its name, its words in Helvetica Bold, appended to the file.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-stamps-')), 'Stamps.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  for (const entry of [
    '/Stamp',
    '/Name /Approved',
    '/Name /Received',
    '/Name /NotForPublicRelease',
    '/BaseFont /Helvetica-Bold',
  ])
    expect(added).toContain(entry);
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});
