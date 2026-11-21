import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// Table navigation (docs/specs/034-text-documents/keyboard-shortcuts.md "Table navigation"; tables.md "Working in a
// table"): Google's Ctrl+Alt+Shift+T sequences move the caret to the table's first cell, down its column and out of it.

const BODY = '[role="textbox"][aria-label="Document body"]';

// A sequence: both keys under the same modifiers, held.
async function sequence(page: Page, first: string, second: string) {
  for (const key of ['Control', 'Alt', 'Shift']) await page.keyboard.down(key);
  await page.keyboard.press(first);
  await page.keyboard.press(second);
  for (const key of ['Shift', 'Alt', 'Control']) await page.keyboard.up(key);
}

test('the table navigation keys move the caret through a table and out of it', async ({
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
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Insert' })
    .click();
  await page.getByRole('menuitem', { name: 'Table', exact: true }).hover();
  await page.locator('[data-size-cell="2x2"]').hover();
  await page.locator('[data-size-cell="2x2"]').click();
  const cells = body.locator('table.text-document-table td');
  await expect(cells).toHaveCount(4);
  for (const word of ['a1', 'b1', 'a2']) {
    await page.keyboard.type(word);
    await page.keyboard.press('Tab');
  }
  await page.keyboard.type('b2');

  // Move to the start of the table, then the next table row: a1, then a2.
  await sequence(page, 'KeyT', 'KeyS');
  await page.keyboard.type('>');
  await sequence(page, 'KeyT', 'KeyM');
  await page.keyboard.type('>');
  await expect(cells).toHaveText(['>a1', 'b1', '>a2', 'b2']);
  // Exit table: the writing after it.
  await sequence(page, 'KeyT', 'KeyE');
  await page.keyboard.type('After');
  await expect(body.locator(':scope > table + p')).toHaveText('After');
  expectNoPageErrors(pageErrors);
});
