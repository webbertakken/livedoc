import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Reshaping a table (docs/specs/034-text-documents/tables.md "Working in a table", "Format > Table", "Context menu"):
// rows and columns inserted from Format > Table and the cell's context menu, cells merged over a selection and unmerged,
// a column and the table deleted; off a table the context menu has no table items.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

async function insertTable(page: Page, columns: number, rows: number) {
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Insert' })
    .click();
  await page.getByRole('menuitem', { name: 'Table', exact: true }).hover();
  const cell = page.locator(`[data-size-cell="${columns}x${rows}"]`);
  await cell.hover();
  await cell.click();
}

test('a table is reshaped from Format > Table and its context menu', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Plain');
  await page.keyboard.press('Enter');
  await insertTable(page, 2, 2);
  for (const word of ['a1', 'b1', 'a2', 'b2']) {
    await page.keyboard.type(word);
    await page.keyboard.press('Tab');
  }
  // Tab in the last cell added a third row; the caret is in its first cell.
  const table = body.locator('table.text-document-table');
  const cells = table.locator('td');
  await expect(cells).toHaveText(['a1', 'b1', 'a2', 'b2', '', '']);

  // Format > Table > Delete row takes the empty row away.
  await (await officeMenuItem(page, ['Format', 'Table', 'Delete row'])).click();
  await expect(cells).toHaveText(['a1', 'b1', 'a2', 'b2']);

  // The cell's context menu: insert a column right of b1.
  await table.locator('td', { hasText: 'b1' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Insert row above' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Unmerge cells' })).toHaveCount(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('cell-context-menu.png') });
  await page.getByRole('menuitem', { name: 'Insert column right' }).click();
  await expect(table.locator('tr').first().locator('td')).toHaveCount(3);
  await expect(cells).toHaveText(['a1', 'b1', '', 'a2', 'b2', '']);

  // Merge a1 and b1: a selection of cells, then the context menu's Merge cells.
  await table.locator('td', { hasText: 'a1' }).click();
  await table.locator('td', { hasText: 'b1' }).click({ modifiers: ['Shift'] });
  await table.locator('td', { hasText: 'b1' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Merge cells' }).click();
  await expect(table.locator('td[colspan="2"]')).toHaveText('a1b1');
  // The merged cell holds both cells' paragraphs; unmerge it from Format > Table.
  await expect(table.locator('td[colspan="2"] p')).toHaveText(['a1', 'b1']);
  await table.locator('td[colspan="2"] p').first().click();
  await (await officeMenuItem(page, ['Format', 'Table', 'Unmerge cells'])).click();
  await expect(table.locator('td[colspan="2"]')).toHaveCount(0);
  await expect(table.locator('tr').first().locator('td')).toHaveCount(3);

  // Delete column, then Delete table.
  await table.locator('td', { hasText: 'b2' }).click();
  await (await officeMenuItem(page, ['Format', 'Table', 'Delete column'])).click();
  await expect(cells).toHaveText(['a1b1', '', 'a2', '']);
  await page.screenshot({ path: test.info().outputPath('table-reshaped.png') });
  await table.locator('td', { hasText: 'a2' }).click();
  await (await officeMenuItem(page, ['Format', 'Table', 'Delete table'])).click();
  await expect(table).toHaveCount(0);

  // Off a table the context menu has no table items, and Format > Table's are dimmed.
  await body.locator('p', { hasText: 'Plain' }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Insert row above' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const dimmed = await officeMenuItem(page, ['Format', 'Table', 'Insert row above']);
  await expect(dimmed).toHaveAttribute('aria-disabled', 'true');
  expectNoPageErrors(pageErrors);
});
