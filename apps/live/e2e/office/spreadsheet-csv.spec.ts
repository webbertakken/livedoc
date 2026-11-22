import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// CSV and TSV in and out of a spreadsheet (plan 0020 Phase 7; docs/specs/029-sheets/files-and-print.md "Import",
// "Download", D117, D118): a Windows-1252 CSV with semicolons opens as one sheet named after the file, its values read
// as typed, and the sheet leaves as CSV and TSV, values as shown, a formula-looking text made inert.

const READY = '[data-spreadsheet-surface="ready"]';

async function inputOf(page: Page, cell: string): Promise<string> {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(cell);
  await nameBox.press('Enter');
  return page.getByRole('textbox', { name: 'Formula bar' }).first().inputValue();
}

test('a CSV opens as a spreadsheet and its sheet leaves as CSV and TSV', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const from = page.url();

  // "Café;3,50 / Total;=1+1 / Risk;=cmd" written by Excel on Windows: Windows-1252, semicolons.
  const dir = mkdtempSync(join(tmpdir(), 'livedoc-csv-'));
  const csv = join(dir, 'Prices.csv');
  const text = 'Item;Amount\r\nCafé;3\r\nTotal;=B2*2\r\nNote;@risk\r\n';
  writeFileSync(csv, Buffer.from(text, 'latin1'));
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(csv);
  await page.waitForURL((url) => url.href !== from);
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Prices');
  await expect(page.getByRole('tab', { name: 'Prices', selected: true })).toBeVisible();
  const grid = page.getByRole('grid', { name: 'Prices grid' });
  await expect(grid).toContainText('Café');
  await expect(grid).toContainText('6');
  expect(await inputOf(page, 'B3')).toBe('=B2*2');

  for (const [format, label, body] of [
    [
      'csv',
      'Comma-separated values (.csv, current sheet)',
      "Item,Amount\r\nCafé,3\r\nTotal,6\r\nNote,'@risk\r\n",
    ],
    [
      'tsv',
      'Tab-separated values (.tsv, current sheet)',
      "Item\tAmount\r\nCafé\t3\r\nTotal\t6\r\nNote\t'@risk\r\n",
    ],
  ] as const) {
    const item = await officeMenuItem(page, ['File', 'Download', label]);
    const [download] = await Promise.all([page.waitForEvent('download'), item.click()]);
    expect(download.suggestedFilename()).toBe(`Prices - Prices.${format}`);
    const saved = join(dir, `out.${format}`);
    await download.saveAs(saved);
    expect(readFileSync(saved, 'utf8')).toBe(body);
  }
  expectNoPageErrors(pageErrors);
});
