import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Named functions in a spreadsheet (plan 0020 Phase 10 box 3; docs/specs/029-sheets/formulas.md "Named functions",
// data-tools.md "Named ranges and named functions"): Data › Named Functions creates CONTAINS, a cell calls it (offered
// as it is typed), editing it works the cell out again, and one undo puts the definition back.

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

test('creates a named function, calls it from a cell, edits it and undoes the edit', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  // A1:A3 hold apple, pear, plum.
  await typeIn(page, 'A1', 'apple');
  await typeIn(page, 'A2', 'pear');
  await typeIn(page, 'A3', 'plum');

  // Data › Named Functions › Add New Function: CONTAINS(search_query, search_range).
  await (await officeMenuItem(page, ['Data', 'Named Functions'])).click();
  const panel = page.getByRole('complementary', { name: 'Named Functions' });
  await expect(panel.getByText('No named functions yet.')).toBeVisible();
  await panel.getByRole('button', { name: 'Add New Function' }).click();
  await panel.getByRole('textbox', { name: 'Function Name' }).fill('contains');
  await panel
    .getByRole('textbox', { name: 'Function Description' })
    .fill('Whether the range holds the value');
  await panel.getByRole('button', { name: 'Add Argument' }).click();
  await panel.getByRole('textbox', { name: 'Argument 1', exact: true }).fill('search_query');
  await panel.getByRole('button', { name: 'Add Argument' }).click();
  await panel.getByRole('textbox', { name: 'Argument 2', exact: true }).fill('search_range');
  await panel
    .getByRole('textbox', { name: 'Formula Definition' })
    .fill('=NOT(ISERROR(MATCH(search_query, search_range, 0)))');
  await panel.getByRole('button', { name: 'Argument Details' }).click();
  await panel.getByRole('textbox', { name: 'search_query Description' }).fill('The value sought');
  await panel.getByRole('textbox', { name: 'search_query Example' }).fill('"pear"');
  await page.screenshot({ path: test.info().outputPath('named-functions-form.png') });
  await panel.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(panel.getByText('CONTAINS(search_query, search_range)')).toBeVisible();

  // B1 calls it, offered as it is typed, its argument helped.
  await select(page, 'B1');
  await page.keyboard.type('=conta');
  await expect(page.getByRole('option', { name: /^CONTAINS/ })).toBeVisible();
  await page.keyboard.type('ins("pear", ');
  await expect(page.getByRole('note')).toContainText('Whether the range holds the value');
  await page.screenshot({ path: test.info().outputPath('named-functions-help.png') });
  await page.keyboard.type('A1:A3)');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'B1 TRUE')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('named-functions-list.png') });

  // Edit turns it round (NOT dropped): B1 follows; one undo puts it back.
  await panel.getByRole('button', { name: 'Edit CONTAINS' }).click();
  await panel
    .getByRole('textbox', { name: 'Formula Definition' })
    .fill('=ISERROR(MATCH(search_query, search_range, 0))');
  await panel.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(cell(page, 'B1 FALSE')).toHaveCount(1);
  await page.locator('[data-sheet-grid]').click({ position: { x: 300, y: 200 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(cell(page, 'B1 TRUE')).toHaveCount(1);

  // Remove leaves the call unknown.
  await panel.getByRole('button', { name: 'Remove CONTAINS' }).click();
  await expect(cell(page, 'B1 #NAME?')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});

// D301: a reference in a definition is saved naming its sheet, absolute; it reads that cell from any cell and follows
// rows inserted above it.
test('keeps a cell reference in a definition, naming its sheet', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  await typeIn(page, 'A1', '0.2');
  await (await officeMenuItem(page, ['Data', 'Named Functions'])).click();
  const panel = page.getByRole('complementary', { name: 'Named Functions' });
  await panel.getByRole('button', { name: 'Add New Function' }).click();
  await panel.getByRole('textbox', { name: 'Function Name' }).fill('with_tax');
  await panel.getByRole('button', { name: 'Add Argument' }).click();
  await panel.getByRole('textbox', { name: 'Argument 1', exact: true }).fill('price');
  await panel.getByRole('textbox', { name: 'Formula Definition' }).fill('=price*(1+A1)');
  await panel.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(panel.getByText('WITH_TAX(price)')).toBeVisible();

  await typeIn(page, 'C5', '=WITH_TAX(100)');
  await expect(cell(page, 'C5 120')).toHaveCount(1);

  // A row inserted above A1: the definition reads A2 now, as Sheet1!$A$2.
  await select(page, 'A1');
  await page.keyboard.press('Shift+F10');
  await page
    .getByRole('menu', { name: 'Context menu' })
    .getByRole('menuitem', { name: 'Insert 1 Row Above' })
    .click();
  await expect(cell(page, 'C6 120')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Edit WITH_TAX' }).click();
  await expect(panel.getByRole('textbox', { name: 'Formula Definition' })).toHaveValue(
    '=price*(1+Sheet1!$A$2)',
  );
  await page.screenshot({ path: test.info().outputPath('named-functions-reference.png') });
  expectNoPageErrors(pageErrors);
});
