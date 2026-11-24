import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

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

test('moves a sheet from its menu and by a drag, SHEET counting the new order', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await openSpreadsheet(page);
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await expect(sheets(page).getByRole('tab', { name: 'Sheet2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await sheets(page).getByRole('tab', { name: 'Sheet1', exact: true }).click();
  await expect(page.locator(READY)).toBeVisible();
  const grid = page.locator('[data-sheet-grid]');
  await grid.click({ position: { x: 120, y: 60 } });
  await page.keyboard.type('="s"&SHEET()');
  await page.keyboard.press('Enter');
  await expect(grid.getByText('s1', { exact: true })).toBeVisible();

  // Move Right: Sheet1 second, and SHEET counts it so.
  await page.getByRole('button', { name: 'Sheet1 menu' }).click();
  await page
    .getByRole('dialog', { name: 'Sheet1 menu' })
    .getByRole('button', { name: 'Move Right' })
    .click();
  await expect.poll(() => tabNames(page)).toEqual(['Sheet2', 'Sheet1']);
  await expect(grid.getByText('s2', { exact: true })).toBeVisible();

  // A drag back to the front, a line showing where it lands.
  const from = await sheets(page).getByRole('tab', { name: 'Sheet1', exact: true }).boundingBox();
  const to = await sheets(page).getByRole('tab', { name: 'Sheet2', exact: true }).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + 4, to!.y + to!.height / 2, { steps: 8 });
  await expect(page.locator('[data-sheet-drop-line]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('tab-drag.png'), animations: 'disabled' });
  await page.mouse.up();
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1', 'Sheet2']);
  await expect(grid.getByText('s1', { exact: true })).toBeVisible();

  // Undo puts it back after the sheet it followed.
  await grid.click({ position: { x: 300, y: 200 } });
  await page.keyboard.press('Control+z');
  await expect.poll(() => tabNames(page)).toEqual(['Sheet2', 'Sheet1']);
  expectNoPageErrors(pageErrors);
});

// spreadsheet.md "Sheets in the sheet bar"; surface.md "Sheet bar" (D177-D180): a tab's colour, hiding a sheet, and
// showing it again from All Sheets and View › Hidden Sheets.
test('colours and hides sheets, shown again from All Sheets and View', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await openSpreadsheet(page);
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await expect(sheets(page).getByRole('tab', { name: 'Sheet2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const face = (name: string) =>
    sheets(page)
      .getByRole('tab', { name, exact: true })
      .locator('xpath=ancestor::*[@data-sheet-tab-face][1]');

  // Change Colour: the one colour picker on the tab; its pick underlines the tab, kept by the server.
  await page.getByRole('button', { name: 'Sheet2 menu' }).click();
  await page
    .getByRole('dialog', { name: 'Sheet2 menu' })
    .getByRole('button', { name: 'Change Colour' })
    .click();
  const picker = page.getByRole('group', { name: 'Colour of Sheet2' });
  await expect(picker).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('tab-colour.png'), animations: 'disabled' });
  await picker.getByRole('button', { name: 'Red' }).nth(1).click();
  await expect(face('Sheet2')).toHaveAttribute('data-sheet-tab-colour', /^#[0-9a-f]{6}$/);

  // Hide Sheet: the open sheet leaves the bar and Sheet1 opens; the last sheet shown cannot be hidden.
  await page.getByRole('button', { name: 'Sheet2 menu' }).click();
  await page
    .getByRole('dialog', { name: 'Sheet2 menu' })
    .getByRole('button', { name: 'Hide Sheet' })
    .click();
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1']);
  await expect(sheets(page).getByRole('tab', { name: 'Sheet1', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('button', { name: 'Sheet1 menu' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Sheet1 menu' }).getByText('Hide Sheet'),
  ).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  // Undo shows it again.
  await expect(page.locator(READY)).toBeVisible();
  await page.locator('[data-sheet-grid]').click({ position: { x: 120, y: 60 } });
  await page.keyboard.press('Control+z');
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1', 'Sheet2']);
  await page.keyboard.press('Control+y');
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1']);

  // Alt+Shift+K: All Sheets lists it, dimmed as Hidden; picking it shows it and opens it.
  await page.locator('[data-sheet-grid]').click({ position: { x: 120, y: 60 } });
  await page.keyboard.press('Alt+Shift+KeyK');
  const all = page.getByRole('dialog', { name: 'All Sheets' });
  await expect(all.locator('[data-all-sheets]')).toHaveText(['✓Sheet1', 'Sheet2Hidden']);
  await page.screenshot({ path: test.info().outputPath('all-sheets.png'), animations: 'disabled' });
  await all.locator('[data-all-sheets]').nth(1).click();
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1', 'Sheet2']);
  await expect(sheets(page).getByRole('tab', { name: 'Sheet2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // View › Hidden Sheets counts them and opens All Sheets.
  await page.getByRole('button', { name: 'Sheet2 menu' }).click();
  await page
    .getByRole('dialog', { name: 'Sheet2 menu' })
    .getByRole('button', { name: 'Hide Sheet' })
    .click();
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1']);
  await (await officeMenuItem(page, ['View', 'Hidden Sheets (1)'])).click();
  await expect(page.getByRole('dialog', { name: 'All Sheets' })).toBeVisible();
  await page.keyboard.press('Escape');

  // The colour and the hiding are the server's: a reload keeps both.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect.poll(() => tabNames(page)).toEqual(['Sheet1']);
  await page.getByRole('button', { name: 'All Sheets' }).click();
  await page
    .getByRole('dialog', { name: 'All Sheets' })
    .locator('[data-all-sheets]')
    .nth(1)
    .click();
  await expect(face('Sheet2')).toHaveAttribute('data-sheet-tab-colour', /^#[0-9a-f]{6}$/);
  expectNoPageErrors(pageErrors);
});
