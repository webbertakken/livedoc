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
