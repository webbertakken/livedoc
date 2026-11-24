import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Conditional formatting in a spreadsheet (plan 0020 Phase 9 box 5; docs/specs/029-sheets/conditional-formatting.md
// "In a spreadsheet", D213): Format › Conditional Formatting opens the Conditional Format Rules side panel; a rule made
// there draws on the grid, the panel stays open on its list, and × closes it.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

async function typeInto(page: Page, cell: string, text: string) {
  await select(page, cell);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('Conditional Format Rules panel makes a rule that draws on the grid', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  for (const [cell, n] of [
    ['A1', '2'],
    ['A2', '7'],
    ['A3', '12'],
  ] as const)
    await typeInto(page, cell, n);

  await select(page, 'A1:A3');
  await (await officeMenuItem(page, ['Format', 'Conditional Formatting'])).click();
  const panel = page.getByRole('complementary', { name: 'Conditional Format Rules' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Add Another Rule' }).click();
  await panel.getByRole('combobox', { name: 'Condition' }).selectOption({ label: 'Greater Than' });
  await panel.getByRole('textbox', { name: 'Value' }).fill('5');
  await panel.getByRole('button', { name: 'Red Fill' }).click();
  await page.screenshot({ path: test.info().outputPath('cf-panel.png'), animations: 'disabled' });
  await panel.getByRole('button', { name: 'Done' }).click();
  // The panel stays open on its list (D213), and 7 and 12 draw in the rule's style, 2 in none.
  await expect(panel.getByRole('list', { name: 'Format rules' })).toContainText('Greater Than 5');
  // Red Fill draws its dark red ink over the cell's own.
  const inkOf = (text: string) =>
    page
      .locator('[data-sheet-text]')
      .filter({ hasText: new RegExp(`^${text}$`) })
      .evaluate((el) => getComputedStyle(el).color);
  await expect.poll(() => inkOf('12')).toBe('rgb(165, 14, 14)');
  expect(await inkOf('2')).not.toBe('rgb(165, 14, 14)');
  await page.screenshot({ path: test.info().outputPath('cf-drawn.png'), animations: 'disabled' });
  await panel.getByRole('button', { name: 'Close Conditional Format Rules' }).click();
  await expect(panel).toBeHidden();
  expectNoPageErrors(pageErrors);
});
