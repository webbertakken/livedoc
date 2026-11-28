import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';
import { solidPng } from './office-pictures';

// A spreadsheet's images over cells (plan 0020 Phase 11 box 3; docs/specs/029-sheets/inserted-objects.md "Images over
// cells"): Insert › Image › Insert Image over Cells places an uploaded picture at the active cell, fitted to 600 by
// 400 and selected; it moves by a drag, keeps its shape by a corner, takes its alt text from its menu, is kept on
// reload, and Delete takes it away until Undo brings it back.

const READY = '[data-spreadsheet-surface="ready"]';
const image = (page: Page) => page.locator('[data-sheet-image]');

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

async function boxOf(page: Page) {
  const box = await image(page).boundingBox();
  if (!box) throw new Error('the image has no box');
  return box;
}

test('Insert Image over Cells places a picture, moved, resized, described, kept and deleted', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  await select(page, 'B3');
  await (await officeMenuItem(page, ['Insert', 'Image', 'Insert Image over Cells'])).click();
  const picker = page.getByRole('dialog', { name: 'Image picker' });
  await expect(picker).toBeVisible();
  await picker.locator('input[type="file"]').setInputFiles({
    name: 'banner.png',
    mimeType: 'image/png',
    buffer: solidPng(1200, 300, [37, 99, 235]),
  });
  await expect(picker).toBeHidden();
  await expect(image(page)).toHaveCount(1);
  // Fitted to 600 by 400 in proportion, selected, drawn from its bytes, and named Image until it has alt text.
  await expect(image(page)).toHaveAttribute('data-selected', '');
  await expect(image(page)).toHaveAttribute('aria-label', 'Image');
  await expect(image(page).locator('img')).toHaveJSProperty('naturalWidth', 1200);
  const placed = await boxOf(page);
  expect(Math.round(placed.width)).toBe(600);
  expect(Math.round(placed.height)).toBe(150);
  await page.screenshot({
    path: test.info().outputPath('image-placed.png'),
    animations: 'disabled',
  });

  // Dragged by its body, it moves; by its corner, it keeps its shape.
  await page.mouse.move(placed.x + 300, placed.y + 75);
  await page.mouse.down();
  await page.mouse.move(placed.x + 360, placed.y + 135, { steps: 5 });
  await page.mouse.up();
  const moved = await boxOf(page);
  expect(Math.round(moved.x - placed.x)).toBe(60);
  expect(Math.round(moved.y - placed.y)).toBe(60);
  const corner = image(page).locator('[data-sheet-object-handle="se"]');
  const handle = await corner.boundingBox();
  if (!handle) throw new Error('no corner handle');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 200, handle.y + handle.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const resized = await boxOf(page);
  expect(Math.round(resized.width)).toBe(400);
  expect(Math.round(resized.height)).toBe(100);

  // Its menu, by a right-click: Alt Text's title and description become its one text.
  await image(page).click({ button: 'right', position: { x: 40, y: 40 } });
  const menu = page.getByRole('menu', { name: 'Context menu' });
  await expect(menu.getByRole('menuitem', { name: 'Replace Image' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('image-menu.png'),
    animations: 'disabled',
  });
  await menu.getByRole('menuitem', { name: 'Alt Text' }).click();
  const alt = page.getByRole('dialog', { name: 'Alt text' });
  await alt.getByRole('textbox', { name: 'Title' }).fill('Banner');
  await alt.getByRole('textbox', { name: 'Description' }).fill('A blue band');
  await page.screenshot({
    path: test.info().outputPath('image-alt-text.png'),
    animations: 'disabled',
  });
  await alt.getByRole('button', { name: 'OK' }).click();
  await expect(image(page)).toHaveAttribute('aria-label', 'Banner\nA blue band');

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(image(page)).toHaveCount(1);
  await expect(image(page)).toHaveAttribute('aria-label', 'Banner\nA blue band');
  await expect(image(page).locator('img')).toHaveJSProperty('naturalWidth', 1200);
  const kept = await boxOf(page);
  expect(Math.round(kept.width)).toBe(400);

  await image(page).click({ position: { x: 40, y: 40 } });
  await expect(image(page)).toHaveAttribute('data-selected', '');
  await page.keyboard.press('Delete');
  await expect(image(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(image(page)).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});

// Pictures held in cells (docs/specs/029-sheets/inserted-objects.md "Images in a cell", D630-D632): Insert Image in
// Cell puts an uploaded picture in the active cell, drawn filling it; a formula reading the cell shows it too; the
// cell's menu gives it alt text and places it over the cells, and an image's menu puts it back in a cell; kept on
// reload, each change one step of Undo.
const cellPicture = (page: Page) => page.locator('[data-sheet-cell-picture]');

async function cellCentre(page: Page, col: number, row: number) {
  const drawn = (role: string, axis: string, n: number) =>
    page.locator(`[role="${role}"][aria-${axis}index="${n}"]:not(.sr-only *)`).boundingBox();
  const letter = await drawn('columnheader', 'col', col);
  const number = await drawn('rowheader', 'row', row);
  return { x: letter!.x + letter!.width / 2, y: number!.y + number!.height / 2 };
}

test('Insert Image in Cell puts a picture in a cell, described, placed over the cells and back', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  // D2 reads B2: it shows B2's picture once B2 holds one.
  await select(page, 'D2');
  await page.keyboard.type('=B2');
  await page.keyboard.press('Enter');
  await select(page, 'B2');
  await (await officeMenuItem(page, ['Insert', 'Image', 'Insert Image in Cell'])).click();
  const picker = page.getByRole('dialog', { name: 'Image picker' });
  await picker.locator('input[type="file"]').setInputFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: solidPng(300, 300, [220, 38, 38]),
  });
  await expect(picker).toBeHidden();
  await expect(cellPicture(page)).toHaveCount(2);
  await expect(cellPicture(page).first().locator('img')).toHaveJSProperty('naturalWidth', 300);
  await page.screenshot({
    path: test.info().outputPath('image-in-cell.png'),
    animations: 'disabled',
  });

  // The cell's menu: its alt text names it to a screen reader.
  const b2 = await cellCentre(page, 2, 2);
  await page.mouse.click(b2.x, b2.y, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Context menu' });
  await expect(menu.getByRole('menuitem', { name: 'Place Image over Cells' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('image-in-cell-menu.png'),
    animations: 'disabled',
  });
  await menu.getByRole('menuitem', { name: 'Alt Text' }).click();
  const alt = page.getByRole('dialog', { name: 'Alt text' });
  await alt.getByRole('textbox', { name: 'Description' }).fill('A red square');
  await alt.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('gridcell', { name: /^B2 A red square$/ })).toHaveCount(1);

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(cellPicture(page)).toHaveCount(2);

  // Over the cells at B2, fitted, its cell empty; then back into the selected cell E4 from the image's menu.
  const b2Again = await cellCentre(page, 2, 2);
  await page.mouse.click(b2Again.x, b2Again.y, { button: 'right' });
  await page
    .getByRole('menu', { name: 'Context menu' })
    .getByRole('menuitem', { name: 'Place Image over Cells' })
    .click();
  await expect(image(page)).toHaveCount(1);
  await expect(cellPicture(page)).toHaveCount(0);
  await expect(image(page)).toHaveAttribute('aria-label', 'A red square');
  const over = await boxOf(page);
  expect(Math.round(over.width)).toBe(300);
  await select(page, 'E4');
  await image(page).click({ button: 'right', position: { x: 40, y: 40 } });
  await page
    .getByRole('menu', { name: 'Context menu' })
    .getByRole('menuitem', { name: 'Place Image in Selected Cell' })
    .click();
  await expect(image(page)).toHaveCount(0);
  await expect(cellPicture(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(image(page)).toHaveCount(1);
  await expect(cellPicture(page)).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
