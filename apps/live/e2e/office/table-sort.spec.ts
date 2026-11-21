import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Sorting and pinning (docs/specs/034-text-documents/tables.md "Working in a table"): Pin up to row 1 makes the first
// row column headers; Sort descending from Format > Table and Sort table ascending from the cell's context menu order the
// rows below it by the caret's column, numbers first; Don't pin takes the headers away.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

test('a table sorts by the caret\u2019s column below its pinned header row', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await body.evaluate((target) => {
    const rows = [
      ['Fruit', 'Count'],
      ['pear', '12'],
      ['Apple', '3'],
      ['fig', '100'],
    ];
    const html = `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
    const data = new DataTransfer();
    data.setData('text/html', html);
    data.setData('text/plain', 'table');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  const table = body.locator('table.text-document-table');
  const firsts = table.locator('tr > :first-child');
  await expect(firsts).toHaveText(['Fruit', 'pear', 'Apple', 'fig']);

  // Pin up to row 1, with the caret in the header row.
  await table.locator('td', { hasText: 'Fruit' }).click();
  await (
    await officeMenuItem(page, ['Format', 'Table', 'Pin header rows', 'Pin up to row 1'])
  ).click();
  await expect(table.locator('th')).toHaveText(['Fruit', 'Count']);

  // Sort descending by Count, numbers in number order; the header row stays.
  await table.locator('td', { hasText: '12' }).click();
  await (await officeMenuItem(page, ['Format', 'Table', 'Sort table', 'Sort descending'])).click();
  await expect(firsts).toHaveText(['Fruit', 'fig', 'pear', 'Apple']);

  // Sort ascending by Fruit, from the context menu: words ignoring case.
  await table.locator('td', { hasText: 'pear' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Sort table ascending' }).click();
  await expect(firsts).toHaveText(['Fruit', 'Apple', 'fig', 'pear']);
  await page.screenshot({ path: test.info().outputPath('table-sorted.png') });

  // Don't pin: no header cells left.
  await table.locator('td', { hasText: 'fig' }).click();
  await (await officeMenuItem(page, ['Format', 'Table', 'Pin header rows', "Don't pin"])).click();
  await expect(table.locator('th')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
