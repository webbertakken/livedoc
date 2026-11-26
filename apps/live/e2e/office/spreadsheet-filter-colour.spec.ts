import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Filter by Colour (plan 0020 Phase 10 box 1; docs/specs/029-sheets/data-tools.md "Filters, filter views and
// slicers"): a filter column lists the fill colours drawn in it, and pressing one keeps only the rows drawn in it.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, ref: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(ref);
  await nameBox.press('Enter');
}

async function typeInto(page: Page, cell: string, text: string) {
  await select(page, cell);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const shown = (page: Page, text: string) =>
  page.locator('[data-sheet-text]').filter({ hasText: new RegExp(`^${text}$`) });

test('Filter by Colour keeps the rows drawn in the chosen fill', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  for (const [i, fruit] of ['Fruit', 'apple', 'pear', 'plum', 'fig'].entries())
    await typeInto(page, `A${i + 1}`, fruit);

  // apple and plum in yellow.
  const fill = page
    .getByRole('toolbar', { name: 'Toolbar' })
    .getByRole('button', { name: 'Fill Colour' });
  for (const cell of ['A2', 'A4']) {
    await select(page, cell);
    await fill.click();
    await page
      .getByRole('group', { name: 'Fill Colour' })
      .getByRole('group', { name: 'Light' })
      .getByRole('button', { name: 'Yellow' })
      .click();
  }

  await select(page, 'A1:A5');
  await (await officeMenuItem(page, ['Data', 'Create a Filter'])).click();
  await page.getByRole('button', { name: 'Filter column 1' }).click();
  const colours = page.getByRole('group', { name: 'Filter by Colour' });
  const swatches = colours.getByRole('group', { name: 'Fill Colour' }).getByRole('button');
  await expect(swatches).toHaveCount(1);
  await swatches.first().click();
  await expect(swatches.first()).toHaveAttribute('aria-pressed', 'true');
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('filter-colour.png') });
  await page.getByRole('button', { name: 'OK' }).click();

  await expect(shown(page, 'pear')).toHaveCount(0);
  await expect(shown(page, 'fig')).toHaveCount(0);
  await expect(shown(page, 'apple')).toHaveCount(1);
  await expect(shown(page, 'plum')).toHaveCount(1);
  await expect(shown(page, 'Fruit')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
