import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The grid at scale (plan 0020 Phase 8 box 3; docs/specs/029-sheets/surface.md "Grid"): the person's zoom from
// View › Zoom and the toolbar's field, everything in the grid working at it.

const READY = '[data-spreadsheet-surface="ready"]';

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
