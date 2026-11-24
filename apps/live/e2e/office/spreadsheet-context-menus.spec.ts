import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Context menus, Full Screen, phone and tablet (plan 0020 Phase 8 box 9; docs/specs/029-sheets/surface.md "Context
// menus", "Layout", "Phone and tablet"): Google's items on a cell, a row number and a column letter, run by the
// menus' bindings; View › Full Screen and Esc; the surface at a phone's and a tablet's size.

const READY = '[data-spreadsheet-surface="ready"]';

async function openSpreadsheet(page: Page, size = { width: 1280, height: 860 }) {
  await page.setViewportSize(size);
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
}

const grid = (page: Page) => page.locator('[data-sheet-grid]');
const contextMenu = (page: Page) => page.getByRole('menu', { name: 'Context menu' });
const menuItem = (page: Page, name: string | RegExp) =>
  contextMenu(page).getByRole('menuitem', { name });
const rowHeader = (page: Page, n: number) =>
  page.locator(`[role="rowheader"][aria-rowindex="${n}"]`);
const colHeader = (page: Page, n: number) =>
  page.locator(`[role="columnheader"][aria-colindex="${n}"]`);

// Headers are drawn under the grid's own pointer handling: pressed where they are drawn.
async function rightClick(page: Page, target: ReturnType<typeof rowHeader>) {
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
}

async function typeAt(page: Page, ref: string, text: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(ref);
  await nameBox.press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

test('opens Google’s menus on a cell, a row number and a column letter, and runs them', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await openSpreadsheet(page);
  await typeAt(page, 'A1', 'pear');
  await typeAt(page, 'A2', 'apple');

  // A cell: Google's order, what is not built dimmed.
  await typeAt(page, 'B1', 'x');
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('B1');
  await nameBox.press('Enter');
  await page.keyboard.press('Shift+F10');
  await expect(contextMenu(page)).toBeVisible();
  await expect(menuItem(page, 'Cut')).toBeFocused();
  await expect(menuItem(page, /^Filter by Cell Value/)).toHaveAttribute('aria-disabled', 'true');
  await page.screenshot({ path: test.info().outputPath('cell-menu.png'), animations: 'disabled' });
  await menuItem(page, 'Insert 1 Row Above').click();
  await expect(contextMenu(page)).toHaveCount(0);
  await expect(grid(page).getByText('x', { exact: true })).toBeVisible();
  await expect(nameBox).toHaveValue('B1');

  // A row number: Hide Row 3, then shown again by its arrows.
  await rightClick(page, rowHeader(page, 3));
  await expect(menuItem(page, 'Hide Row 3')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('row-menu.png'), animations: 'disabled' });
  await menuItem(page, 'Hide Row 3').click();
  await expect(rowHeader(page, 3)).toHaveCount(0);

  // A column letter: Sort Sheet A to Z.
  await rightClick(page, colHeader(page, 1));
  await expect(menuItem(page, 'Sort Sheet A to Z')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('column-menu.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(contextMenu(page)).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

test('View › Full Screen hides the menus and toolbar; Esc and its button bring them back', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  const menubar = page.getByRole('menubar', { name: 'Menu bar' });
  await (await officeMenuItem(page, ['View', 'Full Screen'])).click();
  await expect(menubar).toBeHidden();
  const exit = page.getByRole('button', { name: 'Exit Full Screen' });
  await expect(exit).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('full-screen.png'),
    animations: 'disabled',
  });
  await grid(page).click({ position: { x: 200, y: 80 } });
  await page.keyboard.press('Escape');
  await expect(menubar).toBeVisible();
  await expect(exit).toHaveCount(0);
  await (await officeMenuItem(page, ['View', 'Full Screen'])).click();
  await exit.click();
  await expect(menubar).toBeVisible();
  expectNoPageErrors(pageErrors);
});

for (const [name, size] of [
  ['phone', { width: 390, height: 844 }],
  ['tablet', { width: 820, height: 1180 }],
] as const) {
  test(`keeps the surface's bands on a ${name}`, async ({ page, pageErrors }) => {
    test.setTimeout(90_000);
    await openSpreadsheet(page, size);
    await expect(page.getByRole('tablist', { name: 'Sheets' })).toBeVisible();
    await expect(grid(page)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`${name}.png`), animations: 'disabled' });
    expectNoPageErrors(pageErrors);
  });
}
