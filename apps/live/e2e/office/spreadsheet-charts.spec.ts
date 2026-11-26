import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// A spreadsheet's charts (plan 0020 Phase 11 box 1; docs/specs/029-sheets/charts.md "The model", "Inserting",
// "Working with a chart"): Insert › Chart makes a chart of the data around the active cell, drawn over the cells and
// kept with the sheet; a numbers column against numbers is a scatter, its value axis shown; Delete takes it away and
// Undo brings it back.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

const chart = (page: Page) => page.locator('[data-sheet-chart]');

test('Insert › Chart draws a scatter of the data, kept on reload, deleted and undone', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  // Cost against index, one index left empty: a gap, never 0.
  for (const [cell, text] of [
    ['A1', 'Cost'],
    ['B1', 'Index'],
    ['A2', '1'],
    ['B2', '40'],
    ['A3', '2'],
    ['A4', '3'],
    ['B4', '55'],
    ['A5', '5'],
    ['B5', '61'],
  ] as const) {
    await select(page, cell);
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Insert', 'Chart'])).click();
  await expect(chart(page)).toHaveCount(1);
  await expect(chart(page)).toHaveAttribute('aria-label', 'Scatter chart');
  // The value axis is shown: its tick labels are drawn.
  await expect(chart(page).locator('svg text').first()).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('chart-inserted.png'),
    animations: 'disabled',
  });
  // Inserted with the Chart Editor open on it: a title and an axis title, written as each is left.
  const editor = page.getByRole('complementary', { name: 'Chart Editor' });
  await expect(editor).toBeVisible();
  await editor.getByRole('tab', { name: 'Customise' }).click();
  await editor.getByRole('textbox', { name: 'Chart Title' }).fill('Value for money');
  await editor.getByRole('textbox', { name: 'Vertical Axis Title' }).click();
  await editor.getByRole('textbox', { name: 'Vertical Axis Title' }).fill('Coding index');
  await editor.getByRole('textbox', { name: 'Horizontal Axis Title' }).click();
  await expect(chart(page).locator('[data-chart-title="title"]')).toHaveText('Value for money');
  await expect(chart(page).locator('[data-chart-title="y"]')).toHaveText('Coding index');
  await page.screenshot({
    path: test.info().outputPath('chart-editor.png'),
    animations: 'disabled',
  });

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(chart(page)).toHaveCount(1);

  await chart(page).click({ position: { x: 200, y: 8 } });
  await page.keyboard.press('Delete');
  await expect(chart(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(chart(page)).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
