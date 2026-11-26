import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { textPdf } from '@livedoc/pdf-documents/testing';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { dropPdf, PAGE_ONE, pageOneDrawn } from './pdf-document-pages';

// A mark's Properties end to end (docs/specs/035-pdf-documents/marks.md "Changing a mark": Properties; "In the
// file"): Format > Properties opens the side panel on the selected mark; its subject typed is one step of undo and
// leaves in the file as `Subj`; "Make this look the default" gives the tool the mark's look.

/** A drag across page one between points given as fractions of its box. */
async function drag(page: Page, first: Locator, from: [number, number], to: [number, number]) {
  const box = (await first.boundingBox())!;
  const point = ([x, y]: [number, number]) =>
    [box.x + box.width * x, box.y + box.height * y] as const;
  await page.mouse.move(...point(from));
  await page.mouse.down();
  await page.mouse.move(...point(to), { steps: 6 });
  await page.mouse.up();
}

test('a mark’s Properties show it, take a subject into the file, and make its look the default', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/explorer/all');
  await expect(page.getByRole('heading', { name: 'My Documents' }).first()).toBeVisible();
  const stored = await textPdf(2);
  await dropPdf(page, 'Props.pdf', stored);
  await page.waitForURL(/\/document\//, { timeout: 30_000 });
  const first = await pageOneDrawn(page);
  const rectangles = page.locator(`${PAGE_ONE} [data-pdf-mark-kind="rectangle"]`);

  // A rectangle, given a thick line, then selected with Select.
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await drag(page, first, [0.5, 0.15], [0.75, 0.25]);
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('v');
  const box = (await rectangles.boundingBox())!;
  await page.mouse.click(box.x + 1, box.y + box.height / 2);
  await expect(page.getByRole('button', { name: /^Rectangle by / })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await (await officeMenuItem(page, ['Format', 'Line width', '8 pt'])).click();

  // Format > Properties: the panel on the right reads the mark, focus in its subject.
  await (await officeMenuItem(page, ['Format', 'Properties'])).click();
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Line width')).toBeVisible();
  await expect(panel.getByText('8 pt')).toBeVisible();
  const subject = panel.getByLabel('Subject');
  await expect(subject).toBeFocused();
  await expect(subject).toHaveValue('Rectangle');
  await subject.fill('Check the figures');
  await subject.press('Enter');
  await page.screenshot({ path: test.info().outputPath('pdf-mark-properties.png') });

  // Undo takes the subject back; redo gives it again.
  await page.locator('[data-pdf-pages]').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(subject).toHaveValue('Rectangle');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(subject).toHaveValue('Check the figures');

  // "Make this look the default": the next rectangle is drawn 8 points wide.
  await panel.getByRole('button', { name: 'Make this look the default' }).click();
  await (await officeMenuItem(page, ['Insert', 'Shape', 'Rectangle'])).click();
  await drag(page, first, [0.15, 0.3], [0.35, 0.38]);
  await expect(rectangles).toHaveCount(2);
  await expect(rectangles.nth(1).locator('polygon, polyline').first()).toHaveAttribute(
    'stroke-width',
    /^8$|^8\./,
  );

  // Downloaded: the subject as the annotation's Subj.
  const item = await officeMenuItem(page, ['File', 'Download', 'PDF']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-props-')), 'Props.pdf');
  await download.saveAs(file);
  const added = readFileSync(file).subarray(stored.length).toString('latin1');
  expect(added).toContain('/Subj (Check the figures)');
  execFileSync('qpdf', ['--check', file], { stdio: 'pipe' });
  expectNoPageErrors(pageErrors);
});
