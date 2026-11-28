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
  await expect(page.getByRole('dialog', { name: 'Opened “Fruit from LibreOffice”' })).toHaveCount(
    0,
  );
  await expect(shown(page, 'pear')).toHaveCount(1);
  await expect(shown(page, 'plum')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filter column 1' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-files-from-libreoffice.png') });
  expectNoPageErrors(pageErrors);
});

// data-tools.md "A table's filter" (D481): every table filters on its own and the sheet's filter serves the cells
// beside them; Create a Filter is dimmed over part of a table, saying why; an Excel file holds each table's filter in
// its table part, and through LibreOffice all three come back with the same rows hidden.
test('two tables and the sheet each filter their own rows, and keep them through Excel and LibreOffice', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[2]!;
  for (const [cell, text] of [
    ['A1', 'Fruit'],
    ['B1', 'Count'],
    ['A2', 'apple'],
    ['B2', '3'],
    ['A3', 'plum'],
    ['B3', '1'],
    ['A4', 'pear'],
    ['B4', '8'],
    ['D1', 'Tag'],
    ['E1', 'Size'],
    ['D2', 'red'],
    ['E2', '5'],
    ['D3', 'blue'],
    ['E3', '6'],
    ['D4', 'teal'],
    ['E4', '7'],
    ['G1', 'Note'],
    ['G2', 'keep'],
    ['G3', 'keep'],
    ['G4', 'drop'],
  ] as const)
    await typeInto(page, cell, text);
  for (const [cell, name] of [
    ['A2', 'Table1'],
    ['D2', 'Table2'],
  ] as const) {
    await select(page, cell);
    await (await officeMenuItem(page, ['Format', 'Convert to Table'])).click();
    await expect(page.getByRole('button', { name: `${name} table menu` })).toBeVisible();
    await page.keyboard.press('Escape');
  }

  // A range reaching past a table: Create a Filter is dimmed with its note.
  await select(page, 'A1:D3');
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Data' })
    .click();
  const item = page.getByRole('menuitem', { name: /^Create a Filter/ });
  await expect(item).toBeDisabled();
  await expect(item).toContainText('Overlaps Table1');
  await page.keyboard.press('Escape');

  // Table1 leaves out plum, Table2 leaves out teal (row 4), the sheet's filter over G leaves out drop (row 4 too).
  const filterBy = async (button: string, value: string) => {
    await page.getByRole('button', { name: button }).click();
    await page.getByRole('checkbox', { name: new RegExp(value) }).uncheck();
    await page.getByRole('button', { name: 'OK' }).click();
  };
  await filterBy('Fruit filter', 'plum');
  await filterBy('Tag filter', 'teal');
  await select(page, 'G2');
  await (await officeMenuItem(page, ['Data', 'Create a Filter'])).click();
  await filterBy('Filter column 7', 'drop');
  for (const gone of ['plum', 'blue', 'teal', 'drop'])
    await expect(shown(page, gone)).toHaveCount(0);
  for (const kept of ['apple', 'red']) await expect(shown(page, kept)).toHaveCount(1);
  await expect(page.locator('[data-table-column][data-filtered]')).toHaveCount(2);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('table-filters-two-tables.png') });

  // A table column's filter menu, Column Menu at its top; the table menu's Filter ticked.
  await page.getByRole('button', { name: 'Count filter' }).click();
  await expect(page.getByRole('button', { name: 'Column Menu' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('table-filters-column-menu.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Table2 table menu' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Table2 table menu' })
      .getByRole('button', { name: 'Filter', pressed: true }),
  ).toBeVisible();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('table-filters-table-menu.png') });
  await page.keyboard.press('Escape');

  // A filter view open: the tables' filters pause (D482), their buttons faded; closing it restores them.
  await select(page, 'G2');
  await (await officeMenuItem(page, ['Data', 'Create Filter View'])).click();
  const bar = page.getByRole('toolbar', { name: 'Filter view' });
  await expect(bar).toBeVisible();
  await expect(page.locator('[data-table-column][data-paused]')).toHaveCount(4);
  await expect(
    page.getByRole('button', {
      name: /^Fruit column menu, filter paused while a filter view is open$/,
    }),
  ).toBeVisible();
  await expect(shown(page, 'plum')).toHaveCount(1);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('table-filters-paused.png') });
  await bar.getByRole('button', { name: 'Close Filter View' }).click();
  await expect(page.locator('[data-table-column][data-filtered]')).toHaveCount(2);
  await expect(shown(page, 'plum')).toHaveCount(0);

  // The Excel file, saved again by LibreOffice in its own format, opens with the same rows filtered.
  await (await officeMenuItem(page, ['File', 'Download', 'Microsoft Excel (.xlsx)'])).click();
  const ask = page.getByRole('dialog', { name: 'Download as Excel?' });
  await expect(ask).toContainText('Everything in this spreadsheet fits the Excel format.');
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    ask.getByRole('button', { name: 'Download' }).click(),
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'spreadsheet-table-filters-'));
  const xlsx = join(dir, 'Tables.xlsx');
  await file.saveAs(xlsx);
  const ods = join(dir, 'Tables from LibreOffice.ods');
  writeFileSync(ods, libreOfficeConvert(xlsx, 'ods:calc8', { recalculate: true }));
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(ods);
  await page.waitForURL((url) => !url.pathname.includes(id));
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tables from LibreOffice');
  for (const gone of ['plum', 'blue', 'teal', 'drop'])
    await expect(shown(page, gone)).toHaveCount(0);
  for (const kept of ['apple', 'red']) await expect(shown(page, kept)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Fruit filter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filter column 7' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('table-filters-from-libreoffice.png') });
  expectNoPageErrors(pageErrors);
});
