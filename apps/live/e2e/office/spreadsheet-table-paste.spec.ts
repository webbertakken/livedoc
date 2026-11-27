import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Pasted tables (plan 0020 Phase 10 box 6; docs/specs/029-sheets/data-tools.md "Tables", D454): a copy of a table
// pasted elsewhere makes the next TableN; a cut of the whole table moves it, a formula reading it still reading it;
// one undo puts it back.

const READY = '[data-spreadsheet-surface="ready"]';

const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' });
const cell = (page: Page, name: string) =>
  page.getByRole('grid').getByRole('gridcell', { name, exact: true });

async function select(page: Page, ref: string) {
  await nameBox(page).fill(ref);
  await nameBox(page).press('Enter');
}

async function typeIn(page: Page, ref: string, text: string) {
  await select(page, ref);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('a copied table makes TableN, a cut one moves with its formulas', async ({
  page,
  context,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  for (const [ref, text] of [
    ['A1', 'Item'],
    ['B1', 'Amount'],
    ['A2', 'pen'],
    ['B2', '1'],
    ['A3', 'ink'],
    ['B3', '2'],
  ] as const)
    await typeIn(page, ref, text);
  await select(page, 'A1:B3');
  await (await officeMenuItem(page, ['Format', 'Convert to Table'])).click();
  await expect(page.getByRole('button', { name: 'Table1 table menu' })).toBeVisible();
  await typeIn(page, 'D1', '=SUM(Table1[Amount])');
  await expect(cell(page, 'D1 3')).toBeVisible();

  // A copy pasted at F1: a new table, Table2.
  await select(page, 'A1:B3');
  await page.keyboard.press('ControlOrMeta+c');
  await select(page, 'F1');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByRole('button', { name: 'Table2 table menu' })).toBeVisible();

  // A cut of Table1 pasted at A8: it moves, and D1 still sums it.
  await select(page, 'A1:B3');
  await page.keyboard.press('ControlOrMeta+x');
  await select(page, 'A8');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(cell(page, 'A8 Item')).toBeVisible();
  await expect(cell(page, 'D1 3')).toBeVisible();
  await select(page, 'A9');
  // Table Settings, open since Convert to Table, reads the table at the active cell.
  const panel = page.getByRole('complementary', { name: 'Table Settings' });
  await expect(panel.getByRole('textbox', { name: 'Range' })).toHaveValue('A8:B10');
  await page.screenshot({ path: test.info().outputPath('table-moved.png') });

  // One undo puts the table and its cells back.
  await page.getByRole('grid').focus();
  await page.keyboard.press('Control+z');
  await expect(cell(page, 'A1 Item')).toBeVisible();
  await select(page, 'A2');
  await expect(panel.getByRole('textbox', { name: 'Range' })).toHaveValue('A1:B3');
  await expect(cell(page, 'D1 3')).toBeVisible();
  expectNoPageErrors(pageErrors);
});
