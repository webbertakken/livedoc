import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { libreOfficeConvert } from '@livedoc/office-packages/libreoffice';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Format rules in the file (plan 0020 Phase 9 box 5; docs/specs/029-sheets/standard-mapping.md "Format rules in the
// file"): a rule made in the panel leaves as XLSX, LibreOffice saves the file again, and the XLSX opened here draws
// and lists the same rule.

const READY = '[data-spreadsheet-surface="ready"]';
const DARK_RED = 'rgb(165, 14, 14)';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

const inkOf = (page: Page, text: string) =>
  page
    .locator('[data-sheet-text]')
    .filter({ hasText: new RegExp(`^${text}$`) })
    .evaluate((el) => getComputedStyle(el).color);

test('a format rule leaves as XLSX, passes through LibreOffice and comes back', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  for (const [cell, n] of [
    ['A1', '2'],
    ['A2', '12'],
  ] as const) {
    await select(page, cell);
    await page.keyboard.type(n);
    await page.keyboard.press('Enter');
  }
  await select(page, 'A1:A2');
  await (await officeMenuItem(page, ['Format', 'Conditional Formatting'])).click();
  const panel = page.getByRole('complementary', { name: 'Conditional Format Rules' });
  await panel.getByRole('button', { name: 'Add Another Rule' }).click();
  await panel.getByRole('combobox', { name: 'Condition' }).selectOption({ label: 'Greater Than' });
  await panel.getByRole('textbox', { name: 'Value' }).fill('5');
  await panel.getByRole('button', { name: 'Red Fill' }).click();
  await panel.getByRole('button', { name: 'Done' }).click();
  await expect.poll(() => inkOf(page, '12')).toBe(DARK_RED);
  await panel.getByRole('button', { name: 'Close Conditional Format Rules' }).click();
  await expect(panel).toBeHidden();

  await (await officeMenuItem(page, ['File', 'Download', 'Microsoft Excel (.xlsx)'])).click();
  const dialog = page.getByRole('dialog', { name: /Download as/ });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download' }).click(),
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'format-rules-'));
  const ours = join(dir, 'Ours.xlsx');
  await download.saveAs(ours);
  const xlsx = join(dir, 'Rules in Excel.xlsx');
  writeFileSync(xlsx, libreOfficeConvert(ours, 'xlsx:Calc MS Excel 2007 XML'));

  const before = page.url();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    (await officeMenuItem(page, ['File', 'Open'])).click(),
  ]);
  await chooser.setFiles(xlsx);
  await page.waitForURL((url) => url.href !== before);
  await expect(page.locator(READY)).toBeVisible();
  await expect.poll(() => inkOf(page, '12')).toBe(DARK_RED);
  expect(await inkOf(page, '2')).not.toBe(DARK_RED);
  await select(page, 'A1');
  await (await officeMenuItem(page, ['Format', 'Conditional Formatting'])).click();
  await expect(
    page
      .getByRole('complementary', { name: 'Conditional Format Rules' })
      .getByRole('list', { name: 'Format rules' }),
  ).toContainText('Greater Than 5');
  await page.screenshot({ path: test.info().outputPath('rules-back.png'), animations: 'disabled' });
  expectNoPageErrors(pageErrors);
});
