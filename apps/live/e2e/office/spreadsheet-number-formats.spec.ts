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
