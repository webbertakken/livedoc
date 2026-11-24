import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Rotation (plan 0020 Phase 9 box 4; docs/specs/029-sheets/formatting.md "Alignment, wrapping, rotation", D210, D211):
// Format › Rotation turns a cell's text and its row grows to the turned box; the toolbar's Text Rotation shows and sets
// the one in force; Custom Angle takes a whole angle and refuses one past 90°.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

async function typeInto(page: Page, cell: string, text: string) {
  await select(page, cell);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

// How tall a cell's row is drawn: its text box spans it.
const rowHeight = async (page: Page, text: string) =>
  (await page.locator('[data-sheet-text]').filter({ hasText: text }).boundingBox())!.height;

test('Rotation turns text, grows its row, and takes a custom angle', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await typeInto(page, 'A1', 'Quarterly');
  await typeInto(page, 'B1', 'Region');
  await typeInto(page, 'C1', 'Total');
  const upright = await rowHeight(page, 'Region');

  // Format › Rotation › Rotate Up: the text reads upwards, its row as tall as the text is long.
  await select(page, 'A1');
  await (await officeMenuItem(page, ['Format', 'Rotation', 'Rotate Up'])).click();
  await expect(page.locator('[data-sheet-turned="90"]')).toContainText('Quarterly');
  await expect.poll(() => rowHeight(page, 'Region')).toBeGreaterThan(upright + 20);

  // The toolbar's Text Rotation shows it, and tilts B1 up.
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await expect(toolbar.getByRole('button', { name: 'Text Rotation: Rotate Up' })).toBeVisible();
  await select(page, 'B1');
  await toolbar.getByRole('button', { name: /^Text Rotation/ }).click();
  await page.getByRole('menuitemradio', { name: 'Tilt Up' }).click();
  await expect(page.locator('[data-sheet-turned="45"]')).toContainText('Region');

  // Stack Vertically: a character a line.
  await select(page, 'C1');
  await (await officeMenuItem(page, ['Format', 'Rotation', 'Stack Vertically'])).click();
  await expect(
    page.locator('[data-sheet-text]').filter({ hasText: /^T\no\nt\na\nl$/ }),
  ).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('rotation.png'), animations: 'disabled' });

  // Custom Angle: refuses 120, then turns B1 down by 30.
  await select(page, 'B1');
  await (await officeMenuItem(page, ['Format', 'Rotation', 'Custom Angle'])).click();
  const dialog = page.getByRole('dialog', { name: 'Custom Angle' });
  const field = dialog.getByRole('textbox', { name: 'Angle in degrees' });
  await expect(field).toHaveValue('45');
  await field.fill('120');
  await expect(dialog.getByRole('status')).toHaveText(
    'Enter a whole number of degrees from −90 to 90.',
  );
  await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath('custom-angle.png'),
    animations: 'disabled',
  });
  await field.fill('-30');
  await field.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-sheet-turned="-30"]')).toContainText('Region');
  // None puts it upright again.
  await (await officeMenuItem(page, ['Format', 'Rotation', 'None'])).click();
  await expect(page.locator('[data-sheet-turned="-30"]')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
