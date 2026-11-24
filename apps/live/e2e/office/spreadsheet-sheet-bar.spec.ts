import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// The sheet bar (plan 0020 Phase 8 box 8; docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar"): add,
// rename, duplicate and delete a sheet, each one undo step, through the workbook routes.

const READY = '[data-spreadsheet-surface="ready"]';

async function openSpreadsheet(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
}

const sheets = (page: Page) => page.getByRole('tablist', { name: 'Sheets' });
const tabNames = (page: Page) => sheets(page).getByRole('tab').allTextContents();

test('adds, renames, duplicates and deletes sheets, each undone in one step', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await openSpreadsheet(page);

  // Add Sheet: Sheet2 after the last sheet, opened.
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await expect(sheets(page).getByRole('tab', { name: 'Sheet2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // A double-click names it in place.
  await sheets(page).getByRole('tab', { name: 'Sheet2', exact: true }).dblclick();
  const field = page.getByRole('textbox', { name: 'Sheet name' });
  await expect(field).toBeFocused();
  await field.fill('Data');
  await field.press('Enter');
  await expect(sheets(page).getByRole('tab', { name: 'Data', exact: true })).toBeVisible();

  // Sheet1 reads Data; its menu duplicates it after itself as Copy of Sheet1.
  await sheets(page).getByRole('tab', { name: 'Sheet1', exact: true }).click();
  await expect(page.locator(READY)).toBeVisible();
  await page.locator('[data-sheet-grid]').click({ position: { x: 120, y: 60 } });
  await page.keyboard.type('="n"&SHEETS()');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-sheet-grid]').getByText('n2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sheet1 menu' }).click();
  await page.screenshot({ path: test.info().outputPath('tab-menu.png'), animations: 'disabled' });
  await page
    .getByRole('dialog', { name: 'Sheet1 menu' })
    .getByRole('button', { name: 'Duplicate' })
    .click();
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1', 'Copy of Sheet1', 'Data']);
  await expect(
    sheets(page).getByRole('tab', { name: 'Copy of Sheet1', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-sheet-grid]').getByText('n3', { exact: true })).toBeVisible();

  // Delete asks first, then opens the sheet after it; Undo puts it back where it was.
  await sheets(page)
    .getByRole('tab', { name: 'Copy of Sheet1', exact: true })
    .click({ button: 'right' });
  await page
    .getByRole('dialog', { name: 'Copy of Sheet1 menu' })
    .getByRole('button', { name: 'Delete' })
    .click();
  const ask = page.getByRole('dialog', { name: 'Delete Copy of Sheet1?' });
  await expect(ask).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('delete-ask.png'), animations: 'disabled' });
  await ask.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1', 'Data']);
  await expect(sheets(page).getByRole('tab', { name: 'Data', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.locator('[data-sheet-grid]').click({ position: { x: 120, y: 60 } });
  await page.keyboard.press('Control+z');
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1', 'Copy of Sheet1', 'Data']);

  // Shift+F11 adds after the open sheet; Alt+1 renames the open one.
  await sheets(page).getByRole('tab', { name: 'Sheet1', exact: true }).click();
  await expect(page.locator(READY)).toBeVisible();
  await page.keyboard.press('Shift+F11');
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1', 'Sheet4', 'Copy of Sheet1', 'Data']);
  await expect(page.locator(READY)).toBeVisible();
  await page.keyboard.press('Alt+Digit1');
  await expect(page.getByRole('textbox', { name: 'Sheet name' })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('sheet-bar.png'), animations: 'disabled' });

  // Undo takes the added sheet out again.
  await page.locator('[data-sheet-grid]').click();
  await page.keyboard.press('Control+z');
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1', 'Copy of Sheet1', 'Data']);
  expectNoPageErrors(pageErrors);
});
