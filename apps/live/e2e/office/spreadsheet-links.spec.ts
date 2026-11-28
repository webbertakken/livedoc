import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Links in a spreadsheet (docs/specs/029-sheets/inserted-objects.md "Links"): Ctrl+K links the active cell, its text
// kept; the link card shows on the selected cell; a link to a range of another sheet opens it there; Get Link to This
// Cell copies an address that lands on the range; Remove Link leaves the text.

const READY = '[data-spreadsheet-surface="ready"]';
const CARD = '[data-office-link-card]';
const EDITOR = '[data-office-link-editor]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

// A cell's centre on the screen, from its drawn column and row headers.
async function cellCentre(page: Page, col: number, row: number) {
  const drawn = (role: string, axis: string, n: number) =>
    page.locator(`[role="${role}"][aria-${axis}index="${n}"]:not(.sr-only *)`).boundingBox();
  const letter = await drawn('columnheader', 'col', col);
  const number = await drawn('rowheader', 'row', row);
  return { x: letter!.x + letter!.width / 2, y: number!.y + number!.height / 2 };
}

const nameBoxValue = (page: Page) => page.getByRole('textbox', { name: 'Name box' });

test('links cells to an address and a range, opens, copies and removes them', async ({
  page,
  context,
  pageErrors,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'B2');
  await page.keyboard.type('LiveDoc');
  await page.keyboard.press('Enter');

  // Ctrl+K on B2: Text holds what it shows; an address applied keeps it.
  await select(page, 'B2');
  await page.getByRole('grid').focus();
  await page.keyboard.press('ControlOrMeta+k');
  const editor = page.locator(EDITOR);
  await expect(editor.getByRole('textbox', { name: 'Text' })).toHaveValue('LiveDoc');
  await editor.getByRole('combobox', { name: 'Link' }).fill('docs.nu');
  await page.keyboard.press('Enter');
  await expect(editor).toBeHidden();
  const card = page.locator(CARD);
  await expect(card.getByRole('link')).toHaveText('https://docs.nu/');
  await page.screenshot({ path: test.info().outputPath('spreadsheet-link-card.png') });

  // Insert › Link on D4 to a range of this sheet, picked as typed.
  await select(page, 'D4');
  await (await officeMenuItem(page, ['Insert', 'Link'])).click();
  await editor.getByRole('combobox', { name: 'Link' }).fill('F9:G10');
  await page.screenshot({ path: test.info().outputPath('spreadsheet-link-editor.png') });
  await editor.getByRole('option', { name: /F9:G10/ }).click();
  await editor.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('gridcell', { name: /^D4 .*F9:G10/ })).toHaveCount(1);
  // Its card opens the range.
  await select(page, 'D4');
  await card.getByRole('link').click();
  await expect(nameBoxValue(page)).toHaveValue('F9:G10');

  // Get Link to This Cell copies an address that lands on the selection.
  await select(page, 'C3:D5');
  const c3 = await cellCentre(page, 3, 3);
  await page.mouse.click(c3.x, c3.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'View More Cell Actions' }).click();
  await page.getByRole('menuitem', { name: 'Get Link to This Cell' }).click();
  await expect(page.getByText('Link copied')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\/document\/[^?#]+\?range=C3:D5#t=/);
  await page.goto(copied);
  await expect(page.locator(READY)).toBeVisible();
  await expect(nameBoxValue(page)).toHaveValue('C3:D5');
  expect(page.url()).not.toContain('range=');

  // Remove Link leaves the text.
  await select(page, 'B2');
  await card.getByRole('button', { name: 'Remove Link' }).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole('gridcell', { name: /^B2 LiveDoc$/ })).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
