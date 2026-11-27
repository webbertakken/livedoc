import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Data clean-up and Randomise Range (plan 0020 Phase 10 box 5; docs/specs/029-sheets/data-tools.md "Remove
// Duplicates", "Trim Whitespace", "Randomise Range"): each on the block around the active cell, one undo step.

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

async function inputOf(page: Page, cell: string): Promise<string> {
  await select(page, cell);
  return page.getByRole('textbox', { name: 'Formula bar' }).first().inputValue();
}

const column = async (page: Page, col: string, last: number) => {
  const out: string[] = [];
  for (let row = 2; row <= last; row++) out.push(await inputOf(page, `${col}${row}`));
  return out;
};

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));

test('Remove Duplicates, Trim Whitespace and Randomise Range clean the data, each one undo step', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const rows = [
    ['Name', 'Team'],
    ['  Ada  Lovelace ', 'Red'],
    ['Bo', 'Blue'],
    ['bo', 'Blue'],
    ['Cleo', 'Red'],
    ['Bo', 'Green'],
  ];
  for (const [i, [name, team]] of rows.entries()) {
    await typeInto(page, `A${i + 1}`, name!);
    await typeInto(page, `B${i + 1}`, team!);
  }

  // Trim Whitespace over the block: one cell trimmed, ends gone and the inner run one space.
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Data', 'Data Clean-up', 'Trim Whitespace'])).click();
  await expect(page.getByText('1 cell trimmed')).toBeVisible();
  expect(await inputOf(page, 'A2')).toBe('Ada Lovelace');

  // Remove Duplicates by Name and Team under the header: `bo` is `Bo` case aside; Bo of Green stays.
  await select(page, 'A3');
  await (await officeMenuItem(page, ['Data', 'Data Clean-up', 'Remove Duplicates'])).click();
  const dialog = page.getByRole('dialog', { name: 'Remove Duplicates' });
  await expect(dialog.getByText('Selected range: A1:B6')).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Data has header row' }).check();
  await expect(dialog.getByRole('checkbox', { name: 'Column B - Team' })).toBeChecked();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('remove-duplicates.png') });
  await dialog.getByRole('button', { name: 'Remove Duplicates' }).click();
  await expect(dialog.getByRole('status')).toHaveText(
    '1 duplicate row found and removed. 4 unique rows remain.',
  );
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('remove-duplicates-done.png') });
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();
  expect(await column(page, 'A', 6)).toEqual(['Ada Lovelace', 'Bo', 'Cleo', 'Bo', '']);
  expect(await column(page, 'B', 6)).toEqual(['Red', 'Blue', 'Red', 'Green', '']);

  // One undo brings the duplicate back.
  await page.keyboard.press('Control+z');
  expect(await column(page, 'A', 6)).toEqual(['Ada Lovelace', 'Bo', 'bo', 'Cleo', 'Bo']);

  // Randomise Range keeps each row whole: every name still beside its team.
  await select(page, 'A2:B6');
  await (await officeMenuItem(page, ['Data', 'Randomise Range'])).click();
  const names = await column(page, 'A', 6);
  const teams = await column(page, 'B', 6);
  const pairs = names.map((n, i) => `${n}|${teams[i]}`).sort();
  expect(pairs).toEqual(['Ada Lovelace|Red', 'Bo|Blue', 'Bo|Green', 'Cleo|Red', 'bo|Blue'].sort());
  expect(await inputOf(page, 'A1')).toBe('Name');
  expectNoPageErrors(pageErrors);
});
