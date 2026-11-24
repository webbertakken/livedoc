import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { libreOfficeConvert } from '@livedoc/office-packages/libreoffice';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Cell styles in the file (plan 0020 Phase 9; docs/specs/029-sheets/standard-mapping.md "Cell styles in the file"): a
// cell's bold, font and fill leave as ODF, LibreOffice saves the file again as Excel's, and the XLSX opened here shows
// the same look.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, cell: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(cell);
  await nameBox.press('Enter');
}

test('a cell’s look leaves as ODF, passes through LibreOffice as XLSX and comes back', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'A1');
  await page.keyboard.type('Quarterly total');
  await page.keyboard.press('Enter');
  await select(page, 'A1');

  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await toolbar.getByRole('button', { name: /^Bold/ }).click();
  await toolbar.getByRole('button', { name: 'Font: Arial' }).click();
  await page.getByRole('menuitemradio', { name: 'Roboto Mono' }).click();
  await toolbar.getByRole('button', { name: 'Fill Colour' }).click();
  await page
    .getByRole('group', { name: 'Fill Colour' })
    .getByRole('group', { name: 'Light' })
    .getByRole('button', { name: 'Yellow' })
    .click();
  const fill = toolbar.getByRole('button', { name: 'Fill Colour' }).locator('[data-colour-bar]');
  const yellow = await fill.getAttribute('data-colour-bar');
  expect(yellow).toMatch(/^#[0-9a-f]{6}$/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    (await officeMenuItem(page, ['File', 'Download', 'OpenDocument (.ods)'])).click(),
  ]);
  const dir = mkdtempSync(join(tmpdir(), 'cell-styles-'));
  const ods = join(dir, 'Styled.ods');
  await download.saveAs(ods);
  const xlsx = join(dir, 'Styled in Excel.xlsx');
  writeFileSync(xlsx, libreOfficeConvert(ods, 'xlsx:Calc MS Excel 2007 XML'));

  const before = page.url();
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(xlsx);
  await page.waitForURL((url) => url.href !== before);
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Styled in Excel');
  await select(page, 'A1');
  await expect(toolbar.getByRole('button', { name: /^Bold/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(toolbar.getByRole('button', { name: 'Font: Roboto Mono' })).toBeVisible();
  await expect(fill).toHaveAttribute('data-colour-bar', yellow!);
  await page.screenshot({
    path: test.info().outputPath('styles-back.png'),
    animations: 'disabled',
  });
  expectNoPageErrors(pageErrors);
});
