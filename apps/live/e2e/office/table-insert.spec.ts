import { readFileSync } from 'node:fs';
import { Blocks, Paragraph, readTextDocumentFile, type Table } from '@livedoc/text-documents';
import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// Insert > Table and Tab (docs/specs/034-text-documents/tables.md "Inserting", "Working in a table"; office-shell.md
// "Menus as data", size grid): the grid sized by pointing inserts a lined table at the caret, typed in with Tab moving
// across and adding a row; sized with the keys it inserts again; downloaded, the cells hold what was typed.

const BODY = '[role="textbox"][aria-label="Document body"]';

test.use({ colorScheme: 'dark' });

async function openTableGrid(page: Page) {
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Insert' })
    .click();
  await page.getByRole('menuitem', { name: 'Table', exact: true }).hover();
  const grid = page.getByRole('menuitem', { name: /^Table, \d+ columns? by \d+ rows?$/ });
  await expect(grid).toBeVisible();
  return grid;
}

test('Insert > Table puts a table in from the grid, and Tab moves through it', async ({
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
  await page.keyboard.type('Before');

  // Three columns by two rows, by pointing.
  const grid = await openTableGrid(page);
  await grid.locator('[data-size-cell="3x2"]').hover();
  await expect(grid).toHaveAccessibleName('Table, 3 columns by 2 rows');
  await expect(grid).toContainText('3 x 2');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('table-grid.png') });
  await grid.locator('[data-size-cell="3x2"]').click();

  const table = body.locator('table.text-document-table').first();
  await expect(table.locator('tr')).toHaveCount(2);
  await expect(table.locator('td')).toHaveCount(6);
  const lined = await table
    .locator('td')
    .first()
    .evaluate((td) => getComputedStyle(td).borderTopStyle);
  expect(lined).toBe('solid');
  // The writing before stays above; an empty paragraph follows the table.
  await expect(body.locator(':scope > p').first()).toHaveText('Before');
  await expect(body.locator(':scope > table + p')).toHaveText('');

  // The caret is in the first cell: type across with Tab; Tab in the last cell adds a row.
  for (const word of ['a1', 'b1', 'c1', 'a2', 'b2', 'c2']) {
    await page.keyboard.type(word);
    await page.keyboard.press('Tab');
  }
  await expect(table.locator('tr')).toHaveCount(3);
  await page.keyboard.type('a3');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('C2');
  await expect(table.locator('td')).toHaveText(['a1', 'b1', 'c1', 'a2', 'b2', 'C2', 'a3', '', '']);
  await page.screenshot({ path: test.info().outputPath('table-typed.png') });

  // Sized with the keys: below the table, two columns by two rows.
  await body.locator(':scope > p').last().click();
  const keyed = await openTableGrid(page);
  await keyed.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(keyed).toHaveAccessibleName('Table, 2 columns by 2 rows');
  await page.keyboard.press('Enter');
  await expect(body.locator('table.text-document-table')).toHaveCount(2);
  await expect(body.locator('table.text-document-table').nth(1).locator('td')).toHaveCount(4);

  // Downloaded, the cells hold what was typed.
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'File' })
    .click();
  await page.getByRole('menuitem', { name: 'Download', exact: true }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'OpenDocument format (.odt)', exact: true }).click(),
  ]);
  const saved = test.info().outputPath('table.odt');
  await file.saveAs(saved);
  const read = await readTextDocumentFile(new Uint8Array(readFileSync(saved)));
  expect(read.ok).toBe(true);
  if (read.ok) {
    const first = read.document.body.find((b): b is Table => b.type === 'table');
    expect(first?.columns).toHaveLength(3);
    expect(Blocks.paragraphs(first ? [first] : []).map(Paragraph.text)).toEqual([
      'a1',
      'b1',
      'c1',
      'a2',
      'b2',
      'C2',
      'a3',
      '',
      '',
    ]);
  }
  expectNoPageErrors(pageErrors);
});
