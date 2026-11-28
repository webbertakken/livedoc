import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Notes in a spreadsheet (docs/specs/029-sheets/review.md "Notes"): Shift+F2 opens the note box on the active cell and
// Escape saves it; the cell draws its marker and shows the note on hover; the cell menu edits and deletes notes; undo
// brings a deleted note back; a screen reader hears "has note".

const READY = '[data-spreadsheet-surface="ready"]';
const BOX = '[data-sheet-note-box]';
const MARKER = '[data-sheet-note-marker]';
const CARD = '[data-sheet-note-card]';

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

test('adds, shows, edits and deletes notes on cells', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'B2');
  await page.keyboard.type('Budget');
  await page.keyboard.press('Enter');

  // Shift+F2 on B2 opens the note box; Escape saves the note and gives the grid its keys back.
  await select(page, 'B2');
  await page.getByRole('grid').focus();
  await page.keyboard.press('Shift+F2');
  const box = page.locator(BOX).getByRole('textbox', { name: 'Note' });
  await expect(box).toBeFocused();
  await page.keyboard.type('Checked by finance');
  await page.screenshot({ path: test.info().outputPath('spreadsheet-note-box.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator(BOX)).toBeHidden();
  await expect(page.getByRole('grid')).toBeFocused();
  await expect(page.locator(MARKER)).toHaveCount(1);
  await expect(page.getByRole('gridcell', { name: 'B2 Budget, has note' })).toHaveCount(1);

  // Resting the pointer on the cell shows the note.
  const b2 = await cellCentre(page, 2, 2);
  await page.mouse.move(b2.x, b2.y);
  await expect(page.locator(CARD)).toHaveText('Checked by finance');
  await page.screenshot({ path: test.info().outputPath('spreadsheet-note-card.png') });

  // Insert › Note on two empty cells gives each the note.
  await select(page, 'D4:D5');
  await (await officeMenuItem(page, ['Insert', 'Note'])).click();
  await expect(box).toBeFocused();
  await page.keyboard.type('Estimate');
  await page.getByRole('textbox', { name: 'Name box' }).click();
  await expect(page.locator(BOX)).toBeHidden();
  await expect(page.locator(MARKER)).toHaveCount(3);

  // The cell menu's Edit Note opens the note to change; Delete Notes takes the selection's off, and undo brings them.
  await select(page, 'B2');
  await page.mouse.click(b2.x, b2.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit Note' }).click();
  await expect(box).toHaveValue('Checked by finance');
  await page.keyboard.type(', twice');
  await page.keyboard.press('Shift+F2');
  await page.mouse.move(0, 0);
  await page.mouse.move(b2.x, b2.y);
  await expect(page.locator(CARD)).toHaveText('Checked by finance, twice');
  await select(page, 'A1:D5');
  const a1 = await cellCentre(page, 1, 1);
  await page.mouse.click(a1.x, a1.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete Notes' }).click();
  await expect(page.locator(MARKER)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator(MARKER)).toHaveCount(3);
  expectNoPageErrors(pageErrors);
});
