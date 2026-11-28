import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// A spreadsheet's pivot tables (plan 0020 Phase 11 box 2; docs/specs/029-sheets/pivot-tables.md "Making one", "Pivot
// Table Editor", "Working with one"): Insert › Pivot Table makes one on a new sheet from the data round the active
// cell, the editor adds a row group and a value and the output lands; typing into it is refused; Edit reopens the
// editor; Delete over the whole output removes it and Undo brings it back; a double-click on a value shows its source
// rows on a new sheet, Details1 ("Details", D616), which Undo takes away. Right-clicking items groups them ("Grouping in
// the grid", D621).

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

// A cell as the grid names it to a screen reader: its address, then what it shows.
const cell = (page: Page, name: string) =>
  page.getByRole('grid').getByRole('gridcell', { name, exact: true });

// The middle of a cell as drawn: across from its column letter, level with its row number. The screen reader's mirror
// marks a pivot table's headers with the same roles, so it is left out.
async function cellCentre(page: Page, col: number, row: number) {
  const drawn = (role: string, axis: string, n: number) =>
    page.locator(`[role="${role}"][aria-${axis}index="${n}"]:not(.sr-only *)`).boundingBox();
  const letter = await drawn('columnheader', 'col', col);
  const number = await drawn('rowheader', 'row', row);
  return { x: letter!.x + letter!.width / 2, y: number!.y + number!.height / 2 };
}

// A new spreadsheet holding Region and Units in A1:B4.
async function withData(page: Page) {
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
}

// Region rows summing Units on Pivot Table 1, the editor left open.
async function pivotByRegion(page: Page) {
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Insert', 'Pivot Table'])).click();
  await page
    .getByRole('dialog', { name: 'Create Pivot Table' })
    .getByRole('button', { name: 'Create' })
    .click();
  const editor = page.getByRole('complementary', { name: 'Pivot Table Editor' });
  await editor.getByRole('button', { name: 'Add Rows' }).click();
  await page.getByRole('menuitem', { name: 'Region' }).click();
  await editor.getByRole('button', { name: 'Add Values' }).click();
  await page.getByRole('menuitem', { name: 'Units' }).click();
  await expect(cell(page, 'B2 7')).toHaveCount(1);
  return editor;
}

test('Insert › Pivot Table sums units by region on a new sheet, edited, refused, removed and undone', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await withData(page);
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
  // Its labels and headers read as headers to a screen reader (pivot-tables.md "Accessibility").
  await expect(
    page.getByRole('grid').getByRole('rowheader', { name: 'A4 Grand Total', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('grid').getByRole('columnheader', { name: 'B1 SUM of Units', exact: true }),
  ).toHaveCount(1);
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

test('right-clicking items gathers them into Group 1, renamed by typing, and Ungroup Pivot Items takes it apart', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await withData(page);
  const editor = await pivotByRegion(page);
  await editor.getByRole('button', { name: 'Done' }).click();
  const label = (name: string) =>
    page.getByRole('grid').getByRole('rowheader', { name, exact: true });

  // East and West selected, then right-clicked: Create Pivot Group gathers them.
  await select(page, 'A2:A3');
  const east = await cellCentre(page, 1, 2);
  await page.mouse.click(east.x, east.y, { button: 'right' });
  const group = page.getByRole('menuitem', { name: 'Create Pivot Group', exact: true });
  await expect(group).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Create Pivot Group Rule' })).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('pivot-group-menu.png'),
    animations: 'disabled',
  });
  await group.click();
  await expect(label('A2 Group 1')).toHaveCount(1);
  await expect(cell(page, 'B2 10')).toHaveCount(1);
  await page.screenshot({
    path: test.info().outputPath('pivot-grouped.png'),
    animations: 'disabled',
  });

  // Typed over, Group 1 takes the new name (Webber's ruling 2026-11-28): the one cell that takes typing.
  await select(page, 'A2');
  await page.keyboard.type('Coast');
  await page.keyboard.press('Enter');
  await expect(label('A2 Coast')).toHaveCount(1);
  await page.screenshot({
    path: test.info().outputPath('pivot-group-renamed.png'),
    animations: 'disabled',
  });

  // Coast right-clicked: Ungroup Pivot Items brings East and West back.
  await select(page, 'A2');
  await page.mouse.click(east.x, east.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Ungroup Pivot Items' }).click();
  await expect(label('A2 East')).toHaveCount(1);
  await expect(label('A3 West')).toHaveCount(1);

  expectNoPageErrors(pageErrors);
});

// pivot-tables.md "In the grid", "Sliced" (D629): a slicer over a pivot table's source on its sheet draws the pivot
// table from the rows it keeps, for its presser alone; the cells keep everyone's, which formulas read.
test('a slicer over its source draws the pivot table from the rows it keeps', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await withData(page);
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Insert', 'Pivot Table'])).click();
  const create = page.getByRole('dialog', { name: 'Create Pivot Table' });
  await create.getByLabel('Existing Sheet').check();
  await create.getByLabel('Location').fill('Sheet1!D1');
  await create.getByRole('button', { name: 'Create' }).click();
  const editor = page.getByRole('complementary', { name: 'Pivot Table Editor' });
  await editor.getByRole('button', { name: 'Add Rows' }).click();
  await page.getByRole('menuitem', { name: 'Region' }).click();
  await editor.getByRole('button', { name: 'Add Values' }).click();
  await page.getByRole('menuitem', { name: 'Units' }).click();
  await expect(cell(page, 'E2 7')).toHaveCount(1);
  await select(page, 'G1');
  await page.keyboard.type('=E2');
  await page.keyboard.press('Enter');

  await select(page, 'A2');
  await (await officeMenuItem(page, ['Data', 'Add a Slicer'])).click();
  await expect(
    page.getByRole('complementary', { name: 'Slicer' }).getByLabel('Data Range'),
  ).toHaveValue('A1:B4');
  await page.getByRole('button', { name: /^Region: / }).click();
  await page.getByRole('checkbox', { name: /East/ }).uncheck();
  await page.getByRole('button', { name: 'OK' }).click();
  // West alone, drawn; formulas read everyone's output.
  await expect(
    page.getByRole('grid').getByRole('rowheader', { name: 'D2 West', exact: true }),
  ).toHaveCount(1);
  await expect(cell(page, 'E2 3')).toHaveCount(1);
  await expect(cell(page, 'G1 7')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('pivot-sliced.png') });
  expectNoPageErrors(pageErrors);
});
