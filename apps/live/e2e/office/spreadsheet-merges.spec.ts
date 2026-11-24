import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Merges (plan 0020 Phase 9 box 3; docs/specs/029-sheets/formatting.md "Merges", D208): the toolbar's Merge Cells asks
// before clearing a value, merges, and unmerges what it merged; Format › Merge Cells merges each column down.

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

const cells = (page: Page) =>
  page.getByRole('grid', { name: 'Sheet1 grid' }).locator('[data-sheet-cells]');

test('Merge Cells asks before clearing, merges, unmerges, and merges each column down', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await typeInto(page, 'A1', 'Quarter');
  await typeInto(page, 'B1', 'dropped');

  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const merge = toolbar.getByRole('button', { name: /^Merge Cells/ }).first();
  await select(page, 'A1:B1');
  await merge.click();
  const ask = page.getByRole('dialog', { name: 'Merge Cells' });
  await expect(ask).toContainText('Merging cells will only preserve the top-leftmost value.');
  await page.screenshot({ path: test.info().outputPath('merge-ask.png'), animations: 'disabled' });
  await ask.getByRole('button', { name: 'OK' }).click();
  await expect(ask).toBeHidden();
  await expect(cells(page)).not.toContainText('dropped');
  await expect(cells(page)).toContainText('Quarter');
  await expect(merge).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: test.info().outputPath('merged.png'), animations: 'disabled' });

  // Pressed, the button unmerges.
  await merge.click();
  await expect(merge).toHaveAttribute('aria-pressed', 'false');

  // Format › Merge Cells › Merge Vertically: one cell of each column, nothing to clear, no ask.
  await select(page, 'C1:D3');
  await (await officeMenuItem(page, ['Format', 'Merge Cells', 'Merge Vertically'])).click();
  await expect(ask).toBeHidden();
  await select(page, 'C2');
  await expect(merge).toHaveAttribute('aria-pressed', 'true');
  await (await officeMenuItem(page, ['Format', 'Merge Cells', 'Unmerge'])).click();
  await expect(merge).toHaveAttribute('aria-pressed', 'false');
  expectNoPageErrors(pageErrors);
});
