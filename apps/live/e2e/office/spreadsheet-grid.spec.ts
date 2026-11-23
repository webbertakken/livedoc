import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The grid at scale (plan 0020 Phase 8 box 3; docs/specs/029-sheets/surface.md "Grid"): the person's zoom from
// View › Zoom and the toolbar's field, everything in the grid working at it.

const READY = '[data-spreadsheet-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

async function openSpreadsheet(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
}

// The middle of a cell as drawn: across from its column letter, level with its row number.
async function cellCentre(page: Page, col: number, row: number) {
  const letter = await page.locator(`[role="columnheader"][aria-colindex="${col}"]`).boundingBox();
  const number = await page.locator(`[role="rowheader"][aria-rowindex="${row}"]`).boundingBox();
  return { x: letter!.x + letter!.width / 2, y: number!.y + number!.height / 2 };
}

test('the zoom scales the grid, and the grid works at it', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  const field = page.getByRole('toolbar').getByRole('combobox', { name: /Zoom/ });
  await expect(field).toHaveValue('100%');
  const wide = (await page.locator('[role="columnheader"][aria-colindex="3"]').boundingBox())!;

  await (await officeMenuItem(page, ['View', 'Zoom', '50%'])).click();
  await expect(field).toHaveValue('50%');
  const narrow = (await page.locator('[role="columnheader"][aria-colindex="3"]').boundingBox())!;
  expect(narrow.width).toBeCloseTo(wide.width / 2, 0);

  // A click lands on the cell drawn under it, and typing goes there.
  const c5 = await cellCentre(page, 3, 5);
  await page.mouse.click(c5.x, c5.y);
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('C5');
  await page.keyboard.type('half');
  await page.keyboard.press('Enter');
  await page.screenshot({
    path: test.info().outputPath('zoom-50.png'),
    animations: 'disabled',
  });

  // A typed level applies and ticks no item.
  await field.fill('130');
  await field.press('Enter');
  await expect(field).toHaveValue('130%');
  const zoomItem = await officeMenuItem(page, ['View', 'Zoom', '125%']);
  await expect(zoomItem).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const zoomed = (await page.locator('[role="columnheader"][aria-colindex="3"]').boundingBox())!;
  expect(zoomed.width).toBeCloseTo(wide.width * 1.3, 0);
  await page.screenshot({
    path: test.info().outputPath('zoom-130.png'),
    animations: 'disabled',
  });
  expectNoPageErrors(pageErrors);
});

test('a freeze leaves a third of the grid to scroll', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('A300');
  await nameBox.press('Enter');
  await (await officeMenuItem(page, ['View', 'Freeze', 'Up to Row 300'])).click();
  await page.locator('[data-sheet-grid]').evaluate((grid) => grid.scrollTo({ top: 3_000 }));

  // The rows still in place after a long scroll are the frozen ones: some, but no more than two thirds of the cells.
  const grid = (await page.locator('[data-sheet-grid]').boundingBox())!;
  const letters = (await page.locator('[role="columnheader"][aria-colindex="1"]').boundingBox())!;
  const frozen = await page.locator('[aria-hidden] > [role="rowheader"]').evaluateAll((headers) =>
    headers
      .map((h) => Number(h.getAttribute('aria-rowindex')))
      .sort((a, b) => a - b)
      .findIndex((n, i) => n !== i + 1),
  );
  expect(frozen).toBeGreaterThan(2);
  expect(frozen * 21).toBeLessThanOrEqual(((grid.height - letters.height) * 2) / 3);
  await page.screenshot({
    path: test.info().outputPath('freeze-limit.png'),
    animations: 'disabled',
  });
  expectNoPageErrors(pageErrors);
});

test('a screen reader reads the cells in view, and a row or column on request', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('A1');
  await nameBox.press('Enter');
  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Price');
  await page.keyboard.press('Enter');
  await nameBox.fill('B3');
  await nameBox.press('Enter');
  await page.keyboard.type('12');
  await page.keyboard.press('Enter');

  // The grid's rows hold the cells in view, by address and value; the active cell is the one focus names.
  const grid = page.getByRole('grid');
  await expect(grid.getByRole('gridcell', { name: 'B1 Price' })).toHaveCount(1);
  await expect(grid.getByRole('row').first().getByRole('rowheader')).toHaveText('1');
  const named = await grid.evaluate(
    (g) => document.getElementById(g.getAttribute('aria-activedescendant')!)?.textContent,
  );
  expect(named).toBe('B4 ');

  await nameBox.fill('B3');
  await nameBox.press('Enter');
  const said = page.locator('p[aria-live="polite"]');
  await page.keyboard.press('Control+Alt+Shift+KeyC');
  await expect(said).toHaveText('Column B: B1 Price, B2 blank, B3 12');
  await page.keyboard.press('Control+Alt+Shift+KeyR');
  await expect(said).toHaveText('Row 3: A3 blank, B3 12');
  expectNoPageErrors(pageErrors);
});

// grid-and-editing.md "Moving around", "Selection" (Phase 8 box 4).
test('the keyboard moves across the sheet and between sheets', async ({
  page,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL!).origin });
  const added = await page.request.post(`${apiBase}/documents/${id}/workbook/sheets`, {
    headers,
    data: { name: 'Data' },
  });
  expect(added.status()).toBe(201);
  await expect(page.getByRole('tab', { name: 'Data' })).toBeVisible();

  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('B2');
  await nameBox.press('Enter');
  await page.keyboard.press('Shift+End');
  await expect(nameBox).toHaveValue('B2:Z2');
  await page.screenshot({ path: test.info().outputPath('shift-end.png'), animations: 'disabled' });
  await page.keyboard.press('Control+Shift+Space');
  await expect(nameBox).toHaveValue('A1:Z1000');

  // The summary takes focus from the grid, and gives it back on Escape.
  await nameBox.fill('A1:A3');
  await nameBox.press('Enter');
  await page.keyboard.press('Alt+Shift+KeyQ');
  await expect(page.getByRole('button', { name: /^Selection Summary/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('grid')).toBeFocused();

  // Alt+Down to the next sheet, Alt+Up back; nothing past the first.
  await page.keyboard.press('Alt+ArrowDown');
  await expect(page.getByRole('tab', { name: 'Data', selected: true })).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Data grid' })).toBeFocused();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.getByRole('tab', { name: 'Sheet1', selected: true })).toBeVisible();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.getByRole('tab', { name: 'Sheet1', selected: true })).toBeVisible();
  expectNoPageErrors(pageErrors);
});
