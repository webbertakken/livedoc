import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { libreOfficeConvert } from '@livedoc/office-packages/libreoffice';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Filters in files (plan 0020 Phase 10 box 1, slice b; docs/specs/029-sheets/standard-mapping.md "Filters in the
// file", files-and-print.md "Converting"): a sheet's filter leaves in an Excel file, LibreOffice keeps it in its own
// OpenDocument file, and that file opens here with the same rows filtered; an OpenDocument copy lists its filter view.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, ref: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(ref);
  await nameBox.press('Enter');
}

async function typeInto(page: Page, cell: string, text: string) {
  await select(page, cell);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const shown = (page: Page, text: string) =>
  page.locator('[data-sheet-text]').filter({ hasText: new RegExp(`^${text}$`) });

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

test('a filter leaves in an Excel file, comes back through LibreOffice, and its view is listed for OpenDocument', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const rows = [
    ['Fruit', 'Count'],
    ['apple', '3'],
    ['pear', '8'],
    ['plum', '1'],
  ];
  for (const [i, [fruit, n]] of rows.entries()) {
    await typeInto(page, `A${i + 1}`, fruit!);
    await typeInto(page, `B${i + 1}`, n!);
  }

  // The sheet's filter leaves plum out; a filter view is saved beside it.
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Data', 'Create a Filter'])).click();
  await page.getByRole('button', { name: 'Filter column 1' }).click();
  await page.getByRole('checkbox', { name: /plum/ }).uncheck();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(shown(page, 'plum')).toHaveCount(0);
  await (await officeMenuItem(page, ['Data', 'Create Filter View'])).click();
  const bar = page.getByRole('toolbar', { name: 'Filter view' });
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Close Filter View' }).click();
  await expect(bar).toBeHidden();

  // Converted to Excel, which holds the filter and the view.
  await (await officeMenuItem(page, ['File', 'Convert to Excel (.xlsx)'])).click();
  const convert = page.getByRole('dialog', { name: 'Convert to Excel?' });
  await expect(convert).not.toContainText('filter view');
  await convert.getByRole('button', { name: 'Convert' }).click();
  await expect(convert).toBeHidden();

  // An OpenDocument copy holds no filter views: the dialog says so.
  await (await officeMenuItem(page, ['File', 'Download', 'OpenDocument (.ods)'])).click();
  const copy = page.getByRole('dialog', { name: 'Download as OpenDocument?' });
  await expect(copy).toContainText('1 filter view is left out');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-files-ods-dialog.png') });
  await copy.getByRole('button', { name: 'Cancel' }).click();

  // The Excel file, saved again by LibreOffice in its own format, opens here with plum still filtered out.
  const item = await officeMenuItem(page, ['File', 'Download', 'Microsoft Excel (.xlsx)']);
  const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
  const dir = mkdtempSync(join(tmpdir(), 'spreadsheet-filter-'));
  const xlsx = join(dir, 'Fruit.xlsx');
  await download.saveAs(xlsx);
  const ods = join(dir, 'Fruit from LibreOffice.ods');
  writeFileSync(ods, libreOfficeConvert(xlsx, 'ods:calc8', { recalculate: true }));
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(ods);
  await page.waitForURL((url) => !url.pathname.includes(id));
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fruit from LibreOffice');
  // LibreOffice keeps the view's range as a name of its own: kept quietly, so nothing is reported.
  await expect(page.getByRole('dialog', { name: 'Opened “Fruit from LibreOffice”' })).toHaveCount(0);
  await expect(shown(page, 'pear')).toHaveCount(1);
  await expect(shown(page, 'plum')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filter column 1' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-files-from-libreoffice.png') });
  expectNoPageErrors(pageErrors);
});
