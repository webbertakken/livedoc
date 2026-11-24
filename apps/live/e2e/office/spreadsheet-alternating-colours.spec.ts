import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Alternating colours (plan 0020 Phase 9 box 5; docs/specs/029-sheets/formatting.md "Alternating colours", D216):
// Format › Alternating Colours shades the selection at once and opens its side panel; a default style and the
// Footer switch restyle it on the grid, and Remove takes it away.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

// How many drawn elements fill with a colour (a cell's fill is a div's background).
const filled = (page: Page, rgb: string) =>
  page.evaluate(
    (colour) =>
      [...document.querySelectorAll<HTMLElement>('[data-region="document"] div')].filter(
        (el) => el.style.backgroundColor === colour,
      ).length,
    rgb,
  );

test('Alternating Colours shades a range, restyles it and removes it', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  for (const [cell, text] of [
    ['A1', 'Name'],
    ['A2', 'Ada'],
    ['A3', 'Grace'],
    ['A4', 'Total'],
  ] as const) {
    await select(page, cell);
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  }
  await select(page, 'A1:C4');
  await (await officeMenuItem(page, ['Format', 'Alternating Colours'])).click();
  const panel = page.getByRole('complementary', { name: 'Alternating Colours' });
  await expect(panel.getByRole('textbox', { name: 'Apply to Range' })).toHaveValue('A1:C4');
  // The first default style, its header on: a grey header row (D216).
  await expect.poll(() => filled(page, 'rgb(189, 189, 189)')).toBe(3);
  await panel
    .getByRole('group', { name: 'Default Styles' })
    .getByRole('button', { name: 'Blue' })
    .click();
  await panel.getByRole('switch', { name: 'Footer' }).click();
  await expect.poll(() => filled(page, 'rgb(91, 149, 249)')).toBe(3);
  await expect.poll(() => filled(page, 'rgb(168, 199, 250)')).toBe(3);
  await page.screenshot({ path: test.info().outputPath('banding.png'), animations: 'disabled' });
  await panel.getByRole('button', { name: 'Remove Alternating Colours' }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => filled(page, 'rgb(91, 149, 249)')).toBe(0);
  expectNoPageErrors(pageErrors);
});
