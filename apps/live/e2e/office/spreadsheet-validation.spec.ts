import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Data validation in a spreadsheet (plan 0020 Phase 10 box 2; docs/specs/029-sheets/data-validation.md "In a
// spreadsheet"): Insert › Checkbox ticks with Space, Insert › Dropdown opens Data Validation Rules on a new dropdown,
// and the panel lists the sheet's rules.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, ref: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(ref);
  await nameBox.press('Enter');
}

async function inputOf(page: Page, cell: string): Promise<string> {
  await select(page, cell);
  return page.getByRole('textbox', { name: 'Formula bar' }).first().inputValue();
}

test('Insert › Checkbox and Dropdown make rules the Data Validation panel lists', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  // A checkbox over A1:A3; Space ticks the active one.
  await select(page, 'A1:A3');
  await (await officeMenuItem(page, ['Insert', 'Checkbox'])).click();
  await select(page, 'A2');
  await page.keyboard.press('Space');
  expect(await inputOf(page, 'A2')).toBe('TRUE');

  // A dropdown over B1:B3, its options typed in the panel.
  await select(page, 'B1:B3');
  await (await officeMenuItem(page, ['Insert', 'Dropdown'])).click();
  const panel = page.getByRole('complementary', { name: 'Data Validation Rules' });
  await expect(panel).toBeVisible();
  await panel.getByRole('textbox', { name: 'Option 1' }).fill('To Do');
  await panel.getByRole('textbox', { name: 'Option 2' }).fill('Done');
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('validation-dropdown.png') });
  await panel.getByRole('button', { name: 'Done', exact: true }).click();

  const rules = panel.getByRole('list', { name: 'Validation rules' });
  await expect(rules.getByRole('listitem')).toHaveCount(2);
  await expect(rules).toContainText('Checkbox');
  await expect(rules).toContainText('A1:A3');
  await expect(rules).toContainText('B1:B3');
  await page.screenshot({ path: test.info().outputPath('validation-rules.png') });
  expectNoPageErrors(pageErrors);
});

test('a Custom Formula Is rule refuses a typed value, and a custom checkbox ticks with its own value', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  // B1:B5 allows only a value greater than its row's A.
  await select(page, 'B1:B5');
  await (await officeMenuItem(page, ['Data', 'Data Validation'])).click();
  const panel = page.getByRole('complementary', { name: 'Data Validation Rules' });
  await panel.getByRole('button', { name: 'Add Rule', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Criteria' }).selectOption('formula');
  await panel.getByRole('textbox', { name: 'Formula', exact: true }).fill('=B1>A1');
  await page.screenshot({ path: test.info().outputPath('validation-custom-formula.png') });
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel).toContainText('Custom Formula Is =B1>A1');

  await select(page, 'A1');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await select(page, 'B1');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(page.getByText("Enter a value that meets the rule's formula").first()).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('validation-formula-refused.png') });
  await page.keyboard.press('Escape');
  expect(await inputOf(page, 'B1')).toBe('');
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');
  expect(await inputOf(page, 'B1')).toBe('9');

  // C1:C3 a checkbox ticked Yes, unticked No.
  await select(page, 'C1:C3');
  await panel.getByRole('button', { name: 'Add Rule', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Criteria' }).selectOption('check');
  await panel.getByRole('checkbox', { name: 'Use Custom Cell Values' }).check();
  await panel.getByRole('textbox', { name: 'Ticked Value', exact: true }).fill('Yes');
  await panel.getByRole('textbox', { name: 'Unticked Value', exact: true }).fill('No');
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel).toContainText('Checkbox: Yes, No');
  await select(page, 'C2');
  await page.keyboard.press('Space');
  expect(await inputOf(page, 'C2')).toBe('Yes');
  await page.keyboard.press('Space');
  expect(await inputOf(page, 'C2')).toBe('No');
  await page.screenshot({ path: test.info().outputPath('validation-custom-checkbox.png') });
  expectNoPageErrors(pageErrors);
});

test('a Dropdown from a Range reads another sheet, and shrinks with its rows', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  // Sheet2 holds the list.
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  const tabs = page.getByRole('tablist', { name: 'Sheets' });
  await expect(tabs.getByRole('tab', { name: 'Sheet2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  for (const [cell, value] of [
    ['A1', 'Red'],
    ['A2', 'Green'],
    ['A3', 'Blue'],
  ]) {
    await select(page, cell!);
    await page.keyboard.type(value!);
    await page.keyboard.press('Enter');
  }

  // Sheet1's A1:A5 offers Sheet2's A1:A3.
  await tabs.getByRole('tab', { name: 'Sheet1', exact: true }).click();
  await select(page, 'A1:A5');
  await (await officeMenuItem(page, ['Data', 'Data Validation'])).click();
  const panel = page.getByRole('complementary', { name: 'Data Validation Rules' });
  await panel.getByRole('button', { name: 'Add Rule', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Criteria' }).selectOption('range');
  await panel.getByPlaceholder('A2:A20').fill('Sheet2!A1:A3');
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(panel).toContainText('values in Sheet2!A1:A3');

  await select(page, 'A1');
  await page.keyboard.type('Purple');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Choose one of the values in Sheet2!A1:A3').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.type('green');
  await page.keyboard.press('Enter');
  expect(await inputOf(page, 'A1')).toBe('green');
  await page.screenshot({ path: test.info().outputPath('validation-other-sheet.png') });

  // Sheet2 loses its first row: the rule now reads A1:A2 there.
  await tabs.getByRole('tab', { name: 'Sheet2', exact: true }).click();
  await select(page, 'A1');
  await (
    await officeMenuItem(page, ['Edit', 'Delete', 'x'])
  )
    .or(page.getByRole('menuitem', { name: /^Delete Row 1$/i }))
    .first()
    .click();
  await tabs.getByRole('tab', { name: 'Sheet1', exact: true }).click();
  await (await officeMenuItem(page, ['Data', 'Data Validation'])).click();
  await expect(panel).toContainText('values in Sheet2!A1:A2');
  expectNoPageErrors(pageErrors);
});
