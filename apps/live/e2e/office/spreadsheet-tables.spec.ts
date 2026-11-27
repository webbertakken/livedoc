import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Tables (plan 0020 Phase 10 box 4; docs/specs/029-sheets/data-tools.md "Tables"): Format › Convert to Table makes the
// data a table with its look and opens Table Settings; a formula reads it by name; a value typed below grows it and
// one undo takes both back; the total row sums it; Ctrl+Alt+T converts; the chip's table menu renames it and opens
// the settings, by keyboard too.

const READY = '[data-spreadsheet-surface="ready"]';

const nameBox = (page: Page) => page.getByRole('textbox', { name: 'Name box' });
const cell = (page: Page, name: string) =>
  page.getByRole('grid').getByRole('gridcell', { name, exact: true });

const tableMenu = (page: Page, name: string) =>
  page.getByRole('dialog', { name: `${name} table menu` });

async function select(page: Page, ref: string) {
  await nameBox(page).fill(ref);
  await nameBox(page).press('Enter');
}

async function typeIn(page: Page, ref: string, text: string) {
  await select(page, ref);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('Convert to Table, a table reference, growth and its undo, the total row', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  for (const [ref, text] of [
    ['A2', 'Item'],
    ['B2', 'Amount'],
    ['A3', 'pen'],
    ['B3', '1'],
    ['A4', 'ink'],
    ['B4', '2'],
  ] as const)
    await typeIn(page, ref, text);

  // Format › Convert to Table over the data around B3: Table1, Table Settings open on it.
  await select(page, 'B3');
  await (await officeMenuItem(page, ['Format', 'Convert to Table'])).click();
  const panel = page.getByRole('complementary', { name: 'Table Settings' });
  await expect(panel.getByText('Table1', { exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Range' })).toHaveValue('A2:B4');
  await expect(panel.getByRole('combobox', { name: 'Amount type' })).toHaveValue('number');
  await page.screenshot({ path: test.info().outputPath('table-settings.png') });

  // Renamed in place from its chip's table menu, and a formula reads it by name.
  await page.getByRole('button', { name: 'Table1 table menu' }).click();
  await tableMenu(page, 'Table1').getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Rename Table1' }).fill('Sales');
  await page.getByRole('textbox', { name: 'Rename Table1' }).press('Enter');
  await typeIn(page, 'D2', '=SUM(Sales[Amount])');
  await expect(cell(page, 'D2 3')).toBeVisible();

  // A value typed below grows it; one undo takes the value and the growth back.
  await typeIn(page, 'B5', '4');
  await expect(cell(page, 'D2 7')).toBeVisible();
  await select(page, 'A3');
  await expect(panel.getByRole('textbox', { name: 'Range' })).toHaveValue('A2:B5');
  await page.screenshot({ path: test.info().outputPath('table-grown.png') });
  await page.getByRole('grid').focus();
  await page.keyboard.press('Control+z');
  await expect(cell(page, 'D2 3')).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Range' })).toHaveValue('A2:B4');

  // The total row sums the number column.
  await panel.getByRole('switch', { name: 'Total Row' }).click();
  await expect(cell(page, 'A5 Total')).toBeVisible();
  await expect(cell(page, 'B5 3')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('table-total.png') });
  // Every value settled: none left faded, waiting on the engine.
  await expect(page.locator('[data-sheet-waiting]')).toHaveCount(0);
  await expect(panel.getByRole('switch', { name: 'Total Row' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Ctrl+Alt+T converts the data around another cell; the chip opens its settings.
  await panel.getByRole('button', { name: 'Done' }).click();
  await typeIn(page, 'F2', 'Name');
  await typeIn(page, 'F3', 'x');
  await select(page, 'F2');
  await page.keyboard.press('Control+Alt+t');
  await expect(panel.getByText('Table1', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Done' }).click();

  // The table menu by keyboard: focus the chip, Enter opens it, its first item Table Settings.
  const chip = page.getByRole('button', { name: 'Sales table menu' });
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(
    tableMenu(page, 'Sales').getByRole('button', { name: 'Delete Table' }),
  ).toBeVisible();
  await expect(
    tableMenu(page, 'Sales').getByRole('button', { name: 'Table Settings' }),
  ).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('table-menu.png') });
  await page.keyboard.press('Enter');
  await expect(panel.getByText('Sales', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('table-chips.png') });
  expectNoPageErrors(pageErrors);
});
