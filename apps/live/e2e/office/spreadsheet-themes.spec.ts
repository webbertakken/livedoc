import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Themes (plan 0020 Phase 9 box 5; docs/specs/029-sheets/formatting.md "Themes", D217): a cell filled with a theme
// colour from Fill Colour's Theme row restyles when Format › Theme picks another theme, which the workbook keeps.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

const filled = (page: Page, rgb: string) =>
  page.evaluate(
    (colour) =>
      [...document.querySelectorAll<HTMLElement>('[data-region="document"] div')].filter(
        (el) => el.style.backgroundColor === colour,
      ).length,
    rgb,
  );

test('a theme colour restyles with the theme, which the workbook keeps', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'A1');
  await page.keyboard.type('Total');
  await page.keyboard.press('Enter');
  await select(page, 'A1');
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await toolbar.getByRole('button', { name: 'Fill Colour' }).click();
  await page
    .getByRole('dialog', { name: 'Fill Colour' })
    .getByRole('button', { name: 'Accent 1' })
    .click();
  // Standard's Accent 1 (#4285f4).
  await expect.poll(() => filled(page, 'rgb(66, 133, 244)')).toBe(1);

  await (await officeMenuItem(page, ['Format', 'Theme'])).click();
  const panel = page.getByRole('complementary', { name: 'Themes' });
  await panel.getByRole('group', { name: 'Themes' }).getByRole('button', { name: 'Ocean' }).click();
  // Ocean's Accent 1 (#1a73e8).
  await expect.poll(() => filled(page, 'rgb(26, 115, 232)')).toBe(1);
  await page.screenshot({ path: test.info().outputPath('themes.png'), animations: 'disabled' });

  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect.poll(() => filled(page, 'rgb(26, 115, 232)')).toBe(1);
  expectNoPageErrors(pageErrors);
});
