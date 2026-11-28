import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Slicers (plan 0020 Phase 10 box 1; docs/specs/029-sheets/data-tools.md "Slicers"): Data › Add a Slicer floats one
// over the cells with its panel open; its filter is its presser's alone until Set Current Filters as Default saves it
// for everyone, so a reload filters by the default; SUBTOTAL never reads it.

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

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

test('a slicer filters for its presser, then for everyone once set as the default', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const rows = [
    ['Fruit', 'Count'],
    ['apple', '3'],
    ['pear', '8'],
    ['plum', '1'],
  ];
  for (const [i, [fruit, n]] of rows.entries()) {
    await typeInto(page, `A${i + 1}`, fruit!);
    await typeInto(page, `B${i + 1}`, n!);
  }
  await typeInto(page, 'D1', '=SUBTOTAL(109,B2:B4)');
  await expect(shown(page, '12')).toHaveCount(1);

  const appleAt = (await shown(page, 'apple').boundingBox())!;
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Data', 'Add a Slicer'])).click();
  const slicer = page.getByRole('group', { name: 'Fruit slicer' });
  await expect(slicer).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Slicer' });
  await expect(panel.getByLabel('Data Range')).toHaveValue('A1:B4');
  await panel.getByLabel('Title').fill('Fruits');
  await panel.getByLabel('Title').press('Enter');
  const filterButton = page.getByRole('button', { name: /^Fruits: / });
  await expect(filterButton).toHaveAccessibleName('Fruits: All');

  await filterButton.click();
  await page.getByRole('checkbox', { name: /plum/ }).uncheck();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(shown(page, 'plum')).toHaveCount(0);
  await expect(filterButton).toHaveAccessibleName('Fruits: 2 of 3');
  // Formulas never read a slicer.
  await expect(shown(page, '12')).toHaveCount(1);
  await expect(shown(page, 'apple')).toBeVisible();
  // The cells stay under their headers: pressing the slicer scrolls nothing.
  expect((await shown(page, 'apple').boundingBox())!.x).toBeCloseTo(appleAt.x, 0);
  await expect(page.getByRole('group', { name: 'Fruits slicer' })).toBeInViewport();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('slicer-filtered.png') });

  // One's own is gone on reload: the default keeps every row.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(shown(page, 'plum')).toHaveCount(1);

  await page.getByRole('button', { name: /^Fruits: / }).click();
  await page.getByRole('checkbox', { name: /plum/ }).uncheck();
  await page.getByRole('button', { name: 'OK' }).click();
  await page.getByRole('button', { name: 'Slicer options' }).click();
  await page.getByRole('button', { name: 'Set Current Filters as Default' }).click();
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(shown(page, 'plum')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Fruits: / })).toHaveAccessibleName(
    'Fruits: 2 of 3',
  );
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('slicer-default.png') });
  expectNoPageErrors(pageErrors);
});
