import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// A spreadsheet's pivot tables (plan 0020 Phase 11 box 2; docs/specs/029-sheets/pivot-tables.md "Making one", "Pivot
// Table Editor", "Working with one"): Insert › Pivot Table makes one on a new sheet from the data round the active
// cell, the editor adds a row group and a value and the output lands; typing into it is refused; Edit reopens the
// editor; Delete over the whole output removes it and Undo brings it back; a double-click on a value shows its source
// rows on a new sheet, Details1 ("Details", D616), which Undo takes away.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

// A cell as the grid names it to a screen reader: its address, then what it shows.
const cell = (page: Page, name: string) =>
  page.getByRole('grid').getByRole('gridcell', { name, exact: true });

// The middle of a cell as drawn: across from its column letter, level with its row number.
async function cellCentre(page: Page, col: number, row: number) {
  const letter = await page.locator(`[role="columnheader"][aria-colindex="${col}"]`).boundingBox();
  const number = await page.locator(`[role="rowheader"][aria-rowindex="${row}"]`).boundingBox();
  return { x: letter!.x + letter!.width / 2, y: number!.y + number!.height / 2 };
}

test('Insert › Pivot Table sums units by region on a new sheet, edited, refused, removed and undone', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  for (const [cell, text] of [
    ['A1', 'Region'],
    ['B1', 'Units'],
    ['A2', 'East'],
    ['B2', '5'],
    ['A3', 'West'],
    ['B3', '3'],
    ['A4', 'East'],
    ['B4', '2'],
  ] as const) {
    await select(page, cell);
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Insert', 'Pivot Table'])).click();
  const dialog = page.getByRole('dialog', { name: 'Create Pivot Table' });
  await expect(dialog.getByRole('textbox', { name: 'Data Range' })).toHaveValue('Sheet1!A1:B4');
  await expect(dialog.getByRole('radio', { name: 'New Sheet' })).toBeChecked();
  await page.screenshot({
    path: test.info().outputPath('pivot-create.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Create' }).click();

  // A new sheet, Pivot Table 1, with the editor open on its empty pivot table.
  await expect(page.getByRole('tab', { name: /Pivot Table 1/ })).toBeVisible();
  const editor = page.getByRole('complementary', { name: 'Pivot Table Editor' });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Range' })).toHaveValue('Sheet1!A1:B4');
  await editor.getByRole('button', { name: 'Add Rows' }).click();
  await page.getByRole('menuitem', { name: 'Region' }).click();
  await editor.getByRole('button', { name: 'Add Values' }).click();
  await page.getByRole('menuitem', { name: 'Units' }).click();
  await expect(editor.getByRole('combobox', { name: 'SUM of Units Summarise By' })).toHaveValue(
    'SUM',
  );
  await expect(cell(page, 'B2 7')).toHaveCount(1);
  await expect(cell(page, 'A4 Grand Total')).toHaveCount(1);
  await expect(cell(page, 'B4 10')).toHaveCount(1);
  await page.screenshot({
    path: test.info().outputPath('pivot-editor.png'),
    animations: 'disabled',
  });

  // Typing into the output is refused, and the output stands.
  await select(page, 'B3');
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  await expect(page.getByText("You can't edit a pivot table's cells")).toBeVisible();
  await expect(cell(page, 'B3 3')).toHaveCount(1);

  // Closed, the editor comes back through Edit under the output.
  await editor.getByRole('button', { name: 'Done' }).click();
  await expect(editor).toBeHidden();
  await select(page, 'A2');
  const edit = page.getByRole('button', { name: 'Edit pivot table' });
  await expect(edit).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('pivot-edit-button.png'),
    animations: 'disabled',
  });
  await edit.click();
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Done' }).click();

  // Delete over the whole output removes it; Undo brings it back.
  await select(page, 'A1:B4');
  await page.keyboard.press('Delete');
  await expect(cell(page, 'B4 10')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cell(page, 'B4 10')).toHaveCount(1);

  // A double-click on East's 7 shows East's two rows on Details1; Undo takes the sheet away.
  const east = await cellCentre(page, 2, 2);
  await page.mouse.dblclick(east.x, east.y);
  const details = page.getByRole('tab', { name: /Details1/ });
  await expect(details).toBeVisible();
  await expect(cell(page, 'A1 Region')).toHaveCount(1);
  await expect(cell(page, 'B2 5')).toHaveCount(1);
  await expect(cell(page, 'A3 East')).toHaveCount(1);
  await expect(cell(page, 'B3 2')).toHaveCount(1);
  await expect(cell(page, 'A4 West')).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('pivot-details.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(details).toHaveCount(0);

  expectNoPageErrors(pageErrors);
});
