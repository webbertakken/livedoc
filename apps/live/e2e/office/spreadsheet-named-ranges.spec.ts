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
