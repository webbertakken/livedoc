import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Number formats (plan 0020 Phase 9 box 1; docs/specs/029-sheets/formatting.md "Number formats"): Format › Number's
// items with their examples, Financial and Currency Rounded drawn in the grid.

const READY = '[data-spreadsheet-surface="ready"]';

async function openSpreadsheet(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
}

const grid = (page: Page) => page.locator('[data-sheet-grid]');

test('Format › Number shows each example and draws Financial and Currency Rounded', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('A1');
  await nameBox.press('Enter');
  await page.keyboard.type('-1234.5');
  await page.keyboard.press('Enter');
  await nameBox.fill('A1');
  await nameBox.press('Enter');

  const financial = await officeMenuItem(page, ['Format', 'Number', 'Financial']);
  await expect(financial).toContainText('(1,000.12)');
  await page.screenshot({
    path: test.info().outputPath('number-menu.png'),
    animations: 'disabled',
  });
  await financial.click();
  await expect(grid(page).getByText('(1,234.50)', { exact: true })).toBeVisible();

  await (await officeMenuItem(page, ['Format', 'Number', 'Currency Rounded'])).click();
  await expect(grid(page).getByText(/^-.1,235$/)).toBeVisible();
  const rounded = await officeMenuItem(page, ['Format', 'Number', 'Currency Rounded']);
  await expect(rounded).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  expectNoPageErrors(pageErrors);
});

test('Custom Number Formats applies a code with a colour and refuses one it cannot read', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('A1');
  await nameBox.press('Enter');
  await page.keyboard.type('-42');
  await page.keyboard.press('Enter');
  await nameBox.fill('A1');
  await nameBox.press('Enter');

  await (await officeMenuItem(page, ['Format', 'Number', 'Custom Number Format'])).click();
  const dialog = page.getByRole('dialog', { name: 'Custom Number Formats' });
  const field = dialog.getByRole('textbox', { name: 'Format Code' });
  await field.fill('[Purple]0');
  await expect(dialog.getByRole('status')).toHaveText('`[Purple]` is not a colour or a condition');
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await dialog.getByRole('button', { name: /^#,##0\.00;\[Red\]-#,##0\.00/ }).click();
  await expect(dialog.getByRole('status')).toHaveText('Preview: -42.00');
  await page.screenshot({
    path: test.info().outputPath('custom-format.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(grid(page).getByText('-42.00', { exact: true })).toBeVisible();

  // The code now heads the Number menu's recently used, ticked for this cell (D194).
  const recent = await officeMenuItem(page, ['Format', 'Number', '#,##0.00;[Red]-#,##0.00']);
  await expect(recent).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({
    path: test.info().outputPath('recent-formats.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  expectNoPageErrors(pageErrors);
});
