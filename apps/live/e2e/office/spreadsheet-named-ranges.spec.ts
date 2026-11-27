import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { libreOfficeConvert } from '@livedoc/office-packages/libreoffice';
import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Named ranges in a spreadsheet (plan 0020 Phase 10 box 3; docs/specs/029-sheets/data-tools.md "Named ranges and named
// functions"): Data › Named Ranges adds a name over the selection, goes to it from another sheet, moves it to another
// sheet in one undo step, and a formula reads it from any sheet.

const READY = '[data-spreadsheet-surface="ready"]';

const sheets = (page: Page) => page.getByRole('tablist', { name: 'Sheets' });
const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' });

async function select(page: Page, ref: string) {
  await nameBox(page).fill(ref);
  await nameBox(page).press('Enter');
}

async function typeIn(page: Page, ref: string, text: string) {
  await select(page, ref);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('names a range in the panel, goes to it from another sheet, and moves it there in one undo step', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  // Sheet1's A1:A3 hold 1, 2, 3; Data › Named Ranges opens on Add a Range over the selection.
  await typeIn(page, 'A1', '1');
  await typeIn(page, 'A2', '2');
  await typeIn(page, 'A3', '3');
  await select(page, 'A1:A3');
  await (await officeMenuItem(page, ['Data', 'Named Ranges'])).click();
  const panel = page.getByRole('complementary', { name: 'Named Ranges' });
  await expect(panel.getByRole('textbox', { name: 'Range', exact: true })).toHaveValue('A1:A3');
  await panel.getByRole('textbox', { name: 'Name', exact: true }).fill('Amounts');
  await page.screenshot({ path: test.info().outputPath('named-ranges-add.png') });
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Go To Amounts' })).toContainText('A1:A3');

  // Sheet2 reads it, lists it as Sheet1's, and its Go To opens Sheet1 on it, the panel still open.
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await expect(sheets(page).getByRole('tab', { name: 'Sheet2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await typeIn(page, 'B1', '=SUM(Amounts)');
  await expect(page.getByRole('grid').getByRole('gridcell', { name: 'B1 6' })).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Go To Amounts' })).toContainText('Sheet1!A1:A3');
  await page.screenshot({ path: test.info().outputPath('named-ranges-list.png') });
  await panel.getByRole('button', { name: 'Go To Amounts' }).click();
  await expect(sheets(page).getByRole('tab', { name: 'Sheet1', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(nameBox(page)).toHaveValue('Amounts');
  await expect(panel).toBeVisible();

  // Edit moves it to Sheet2's C1:C2, one change; the formula reads the new cells, and one undo puts it back.
  await panel.getByRole('button', { name: 'Edit Amounts' }).click();
  await panel.getByRole('textbox', { name: 'Range', exact: true }).fill('Sheet2!C1:C2');
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Go To Amounts' })).toContainText('Sheet2!C1:C2');
  await page.locator('[data-sheet-grid]').click({ position: { x: 300, y: 200 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(panel.getByRole('button', { name: 'Go To Amounts' })).toContainText('A1:A3');
  await expect(panel.getByRole('button', { name: 'Go To Amounts' })).not.toContainText('Sheet2');
  expectNoPageErrors(pageErrors);
});

// Named ranges in files (standard-mapping.md "Named ranges in the file"): a name leaves as the workbook's name in XLSX
// and ODF; LibreOffice works a formula reading it out afresh, saves the file again, and the name comes back here.
for (const [item, dialog, filter, name] of [
  ['Microsoft Excel (.xlsx)', true, 'xlsx:Calc MS Excel 2007 XML', 'Names in Excel.xlsx'],
  ['OpenDocument (.ods)', false, 'ods:calc8', 'Names in Calc.ods'],
] as const)
  test(`a named range leaves as ${name.split('.').pop()}, works in LibreOffice and comes back`, async ({
    page,
    pageErrors,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('/new?kind=spreadsheet');
    await page.waitForURL(/\/document\//);
    await expect(page.locator(READY)).toBeVisible();
    await typeIn(page, 'A1', '2');
    await typeIn(page, 'A2', '3');
    await typeIn(page, 'A3', '4');
    await select(page, 'A1:A3');
    await nameBox(page).fill('Total');
    await nameBox(page).press('Enter');
    await typeIn(page, 'B1', '=SUM(Total)');
    await expect(page.getByRole('grid').getByRole('gridcell', { name: 'B1 9' })).toHaveCount(1);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await (await officeMenuItem(page, ['File', 'Download', item])).click();
        if (dialog)
          await page
            .getByRole('dialog', { name: /Download as/ })
            .getByRole('button', { name: 'Download' })
            .click();
      })(),
    ]);
    const dir = mkdtempSync(join(tmpdir(), 'named-ranges-'));
    const ours = join(dir, `Ours.${name.split('.').pop()}`);
    await download.saveAs(ours);

    // LibreOffice works the formula out afresh from the name, never trusting the cached value.
    const csv = libreOfficeConvert(ours, 'csv', { recalculate: true }).toString('utf8').trim();
    expect(csv.split(/\r?\n/)[0]).toBe('2,9');
    const saved = join(dir, name);
    writeFileSync(saved, libreOfficeConvert(ours, filter, { recalculate: true }));

    const before = page.url();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      (await officeMenuItem(page, ['File', 'Open'])).click(),
    ]);
    await chooser.setFiles(saved);
    await page.waitForURL((url) => url.href !== before);
    await expect(page.locator(READY)).toBeVisible();
    await expect(page.getByRole('grid').getByRole('gridcell', { name: 'B1 9' })).toHaveCount(1);
    await (await officeMenuItem(page, ['Data', 'Named Ranges'])).click();
    const panel = page.getByRole('complementary', { name: 'Named Ranges' });
    await expect(panel.getByRole('button', { name: 'Go To Total' })).toContainText('A1:A3');
    await page.screenshot({
      path: test.info().outputPath(`named-ranges-from-${name.split('.').pop()}.png`),
    });
    expectNoPageErrors(pageErrors);
  });
