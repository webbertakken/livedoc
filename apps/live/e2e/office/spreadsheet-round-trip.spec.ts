import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { libreOfficeConvert } from '@livedoc/office-packages/libreoffice';
import { officeMenuItem } from './office-menus';

// A spreadsheet end to end (plan 0020 Phase 4; docs/specs/029-sheets/spreadsheet.md, sheet-store.md "In a
// spreadsheet", standard-mapping.md, files-and-print.md): a new spreadsheet, stored in its room, a value and a formula
// typed together in two browsers, downloaded as ODF, recalculated by LibreOffice to the same values, saved again by
// it, and opened back here unchanged; then saved by it as XLSX, opened here as an XLSX workbook and downloaded as one,
// as ODF a converted copy, and converted to ODF, one undo step.

const READY = '[data-spreadsheet-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

async function peerOn(browser: Browser, baseURL: string, code: string): Promise<Page> {
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1280, height: 860 },
  });
  const page = await ctx.newPage();
  await page.goto(`/document/shared?s=${code}`);
  // A visitor joins under a name when the welcome asks for one; the grid shows either way.
  const join = page.getByRole('button', { name: /^join$/i });
  await expect(join.or(page.locator(READY))).toBeVisible();
  if (await join.isVisible()) await join.click();
  await expect(page.locator(READY)).toBeVisible();
  return page;
}

// Types into a cell as a person does: its name in the Name box, then the input, then Enter.
async function typeInto(page: Page, cell: string, input: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(cell);
  await nameBox.press('Enter');
  await page.keyboard.type(input);
  await page.keyboard.press('Enter');
}

// What a cell holds as typed, read from the formula bar once it is selected.
async function inputOf(page: Page, cell: string): Promise<string> {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(cell);
  await nameBox.press('Enter');
  return page.getByRole('textbox', { name: 'Formula bar' }).first().inputValue();
}

test('a spreadsheet typed together leaves as ODF, recalculates in LibreOffice and comes back unchanged', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled spreadsheet');
  await expect(page.getByRole('tab', { name: 'Sheet1', selected: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[2]!;

  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const peer = await peerOn(browser, baseURL!, code);

  // The owner types a value while the peer types the formula that reads it: both land on both screens.
  await Promise.all([typeInto(page, 'A1', '21'), typeInto(peer, 'B1', '=A1*2')]);
  await typeInto(page, 'A2', 'rent');
  for (const p of [page, peer]) {
    const grid = p.getByRole('grid', { name: 'Sheet1 grid' });
    await expect(grid.locator('[data-sheet-cells]')).toContainText('42');
    await expect(grid.locator('[data-sheet-cells]')).toContainText('rent');
  }

  // Downloaded as ODF, in the format it was born in (C5).
  const downloadItem = await officeMenuItem(page, ['File', 'Download', 'OpenDocument (.ods)']);
  const [download] = await Promise.all([page.waitForEvent('download'), downloadItem.click()]);
  expect(download.suggestedFilename()).toBe('Untitled spreadsheet.ods');
  const dir = mkdtempSync(join(tmpdir(), 'spreadsheet-'));
  const ods = join(dir, 'Budget.ods');
  await download.saveAs(ods);

  // LibreOffice works every formula out afresh, never trusting the cached values: the same values.
  const csv = libreOfficeConvert(ods, 'csv', { recalculate: true }).toString('utf8').trim();
  expect(csv.split(/\r?\n/)).toEqual(['21,42', 'rent,']);

  // Saved again by LibreOffice, then opened here: the same inputs, formula included, in a new spreadsheet.
  const resaved = join(dir, 'Budget from LibreOffice.ods');
  writeFileSync(resaved, libreOfficeConvert(ods, 'ods:calc8', { recalculate: true }));
  const open = await officeMenuItem(page, ['File', 'Open']);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
  await chooser.setFiles(resaved);
  await page.waitForURL((url) => !url.pathname.includes(id));
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Budget from LibreOffice');
  await expect(
    page.getByRole('grid', { name: 'Sheet1 grid' }).locator('[data-sheet-cells]'),
  ).toContainText('42');
  expect(await inputOf(page, 'A1')).toBe('21');
  expect(await inputOf(page, 'B1')).toBe('=A1*2');
  expect(await inputOf(page, 'A2')).toBe('rent');

  // standard-mapping.md "Excel's grammar in detail": the same workbook as Excel's file keeps that format both ways.
  const xlsx = join(dir, 'Budget in Excel.xlsx');
  writeFileSync(
    xlsx,
    libreOfficeConvert(resaved, 'xlsx:Calc MS Excel 2007 XML', { recalculate: true }),
  );
  const fromOds = page.url();
  const openXlsx = await officeMenuItem(page, ['File', 'Open']);
  const [xlsxChooser] = await Promise.all([page.waitForEvent('filechooser'), openXlsx.click()]);
  await xlsxChooser.setFiles(xlsx);
  await page.waitForURL((url) => url.href !== fromOds);
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Budget in Excel');
  expect(await inputOf(page, 'B1')).toBe('=A1*2');
  const xlsxItem = await officeMenuItem(page, ['File', 'Download', 'Microsoft Excel (.xlsx)']);
  const [xlsxDownload] = await Promise.all([page.waitForEvent('download'), xlsxItem.click()]);
  expect(xlsxDownload.suggestedFilename()).toBe('Budget in Excel.xlsx');
  const back = join(dir, 'Budget back.xlsx');
  await xlsxDownload.saveAs(back);
  const xlsxCsv = libreOfficeConvert(back, 'csv', { recalculate: true }).toString('utf8').trim();
  expect(xlsxCsv.split(/\r?\n/)).toEqual(['21,42', 'rent,']);

  // files-and-print.md "Download": the other standard is a converted copy, what it cannot hold listed first: the
  // Excel file's kept content stays behind (standard-mapping.md "Unknown content", D109).
  await (await officeMenuItem(page, ['File', 'Download', 'OpenDocument (.ods)'])).click();
  const copyDialog = page.getByRole('dialog', { name: 'Download as OpenDocument?' });
  await expect(copyDialog).toContainText(/things? kept from the Excel file stays? behind/);
  const [copy] = await Promise.all([
    page.waitForEvent('download'),
    copyDialog.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(copy.suggestedFilename()).toBe('Budget in Excel.ods');

  // "Converting": the workbook's format changes after the dialog, and undo changes it back.
  const pill = page
    .getByRole('img', { name: 'Excel format', exact: true })
    .or(page.getByRole('img', { name: 'OpenDocument format', exact: true }));
  await expect(pill).toHaveText('.XLSX');
  await (await officeMenuItem(page, ['File', 'Convert to OpenDocument (.ods)'])).click();
  const convertDialog = page.getByRole('dialog', { name: 'Convert to OpenDocument?' });
  await convertDialog.getByRole('button', { name: 'Convert' }).click();
  await expect(convertDialog).toBeHidden();
  await expect(pill).toHaveText('.ODS');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(pill).toHaveText('.XLSX');
  expectNoPageErrors(pageErrors);
});
