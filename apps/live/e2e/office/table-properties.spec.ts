import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Table properties (docs/specs/034-text-documents/tables.md "Table properties"): opened from Format > Table, it shows
// the caret's cell and changes it: a column's width, the border's width, the table centred; outside a table it says
// where to put the cursor.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

test('Table properties shows and changes the caret\u2019s table', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator('[data-text-document-surface="ready"]')).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Before');
  await page.keyboard.press('Enter');
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Insert' })
    .click();
  await page.getByRole('menuitem', { name: 'Table', exact: true }).hover();
  await page.locator('[data-size-cell="2x2"]').hover();
  await page.locator('[data-size-cell="2x2"]').click();
  await page.keyboard.type('a1');
  const table = body.locator('table.text-document-table');
  const first = table.locator('td').first();

  await (await officeMenuItem(page, ['Format', 'Table', 'Table properties'])).click();
  const panel = page.getByRole('complementary', { name: 'Table properties' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('combobox', { name: 'Border width' })).toHaveValue('1');

  // Column width: 2 in (or 5.08 cm), applied on Enter.
  const width = panel.getByRole('textbox', { name: 'Column width' });
  const unit = (await panel
    .getByText(/^(in|cm)$/)
    .first()
    .textContent())!;
  await width.fill(unit === 'in' ? '2' : '5.08');
  await width.press('Enter');
  await expect
    .poll(() => first.evaluate((td) => Math.round(td.getBoundingClientRect().width)))
    .toBeGreaterThan(180);

  // Border width 3 pt and the table centred, at once.
  await panel.getByRole('combobox', { name: 'Border width' }).selectOption('3');
  await expect.poll(() => first.evaluate((td) => getComputedStyle(td).borderTopWidth)).toBe('4px');
  await panel.getByRole('combobox', { name: 'Table alignment' }).selectOption('center');
  await expect(panel.getByRole('textbox', { name: 'Left indent' })).toBeDisabled();
  await expect.poll(() => table.evaluate((t) => getComputedStyle(t).marginLeft)).not.toBe('0px');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('table-properties.png') });

  // Outside the table, the panel says where to put the cursor.
  await body.locator(':scope > p', { hasText: 'Before' }).click();
  await expect(panel.getByText('Put the cursor in a table to see its properties.')).toBeVisible();
  expectNoPageErrors(pageErrors);
});
