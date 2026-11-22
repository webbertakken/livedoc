import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Moving a table's rows and columns (docs/specs/034-text-documents/tables.md "Working in a table", Move): Format >
// Table moves the caret's row past its neighbour, the caret with it; dragging a column's grip moves it where it drops.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

test('rows and columns move from Format > Table and by their grips', async ({
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
  await body.evaluate((target) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<table><tr><td>a1</td><td>b1</td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr></table><p>After</p>',
    );
    data.setData('text/plain', 'table');
    target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  const table = body.locator('table.text-document-table').first();
  const rows = table.locator(':scope > tbody > tr:not(.text-document-page-gap)');
  await expect(rows).toHaveCount(3);
  const firstColumn = () =>
    rows.evaluateAll((all) => all.map((r) => r.firstElementChild?.textContent));
  const firstRow = () => rows.first().evaluate((r) => [...r.children].map((c) => c.textContent));

  // Format > Table > Move row down: a1's row goes below a2's, the caret with it.
  await table.locator('td p', { hasText: /^a1$/ }).click();
  await (await officeMenuItem(page, ['Format', 'Table', 'Move row down'])).click();
  await expect.poll(firstColumn).toEqual(['a2', 'a1', 'a3']);
  await page.keyboard.type('!');
  await expect(table.locator('td p', { hasText: /^a1!$/ })).toHaveCount(1);
  await page.keyboard.press('Backspace');

  // Dragging column c's grip to the table's left edge.
  const c = (await table.locator('td', { hasText: /^c2$/ }).boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  const grip = page.locator('.text-document-table-grip[data-kind="column"]');
  await expect(grip).toBeVisible();
  await expect(grip).toHaveAttribute('aria-hidden', 'true');
  const g = (await grip.boundingBox())!;
  const start = (await table.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(start.x + 20, g.y + g.height / 2, { steps: 6 });
  await expect(page.locator('.text-document-table-drop')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('table-move-drop.png') });
  await page.mouse.up();
  await expect.poll(firstRow).toEqual(['c2', 'a2', 'b2']);

  // Undo puts the column back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(firstRow).toEqual(['a2', 'b2', 'c2']);
  expectNoPageErrors(pageErrors);
});
