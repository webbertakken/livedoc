import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Insert › Emoji in a spreadsheet (docs/specs/029-sheets/inserted-objects.md "Tick boxes, dropdowns and emoji", D635):
// an emoji picked opens the active cell's edit with it after the cell's text, the dialog staying open for more;
// closing it gives the edit the keys back, and Enter saves the cell.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

test('Insert › Emoji puts emoji in the active cell’s edit, saved by Enter', async ({
  page,
  pageErrors,
}) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'B2');
  await page.keyboard.type('Done');
  await page.keyboard.press('Enter');

  await select(page, 'B2');
  await (await officeMenuItem(page, ['Insert', 'Emoji'])).click();
  const dialog = page.getByRole('dialog', { name: 'Insert emoji' });
  await dialog.getByRole('searchbox', { name: 'Search emoji' }).fill('party popper');
  const grid = dialog.getByRole('group', { name: 'Emoji' });
  await grid.getByRole('button', { name: 'Party popper', exact: true }).click();
  await expect(dialog).toBeVisible();
  await grid.getByRole('button', { name: 'Party popper', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('spreadsheet-emoji.png') });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  const editor = page.getByRole('textbox', { name: 'Edit cell B2' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Done🎉🎉');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('gridcell', { name: /^B2 Done🎉🎉$/ })).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
