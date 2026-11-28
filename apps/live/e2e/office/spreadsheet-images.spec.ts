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
