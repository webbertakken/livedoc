import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Sort Range's advanced options (plan 0020 Phase 10 box 1; docs/specs/029-sheets/data-tools.md "Sort"): the dialog
// titled by the range, the headers offered once the data has a header row, two keys each its own order, one undo step.

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

const column = async (page: Page, col: string) => {
  const out: string[] = [];
  for (const row of [2, 3, 4, 5]) out.push(await inputOf(page, `${col}${row}`));
  return out;
};

test('Advanced Range Sorting Options sorts by several keys under a header row', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const rows = [
    ['Team', 'Name'],
    ['Blue', 'Cleo'],
    ['Red', 'Ada'],
    ['Blue', 'Bo'],
    ['Red', 'Dan'],
  ];
  for (const [i, [team, name]] of rows.entries()) {
    await typeInto(page, `A${i + 1}`, team!);
    await typeInto(page, `B${i + 1}`, name!);
  }

  await select(page, 'A1:B5');
  await (
    await officeMenuItem(page, ['Data', 'Sort Range', 'Advanced Range Sorting Options'])
  ).click();
  const dialog = page.getByRole('dialog', { name: 'Sort range from A1 to B5' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Data has header row' }).check();
  const sortBy = dialog.getByRole('group', { name: 'Sort by' });
  await sortBy.getByRole('combobox').selectOption({ label: 'Team' });
  await sortBy.getByRole('radio', { name: 'Z → A' }).check();
  await dialog.getByRole('button', { name: 'Add Another Sort Column' }).click();
  await expect(dialog.getByRole('group', { name: 'Then by' }).getByRole('combobox')).toHaveValue(
    '1',
  );
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('sort-range.png') });
  await dialog.getByRole('button', { name: 'Sort', exact: true }).click();
  await expect(dialog).toBeHidden();

  // Red before Blue, each by name; the header stays.
  expect(await inputOf(page, 'A1')).toBe('Team');
  expect(await column(page, 'A')).toEqual(['Red', 'Red', 'Blue', 'Blue']);
  expect(await column(page, 'B')).toEqual(['Ada', 'Dan', 'Bo', 'Cleo']);

  // One undo step puts every row back.
  await page.keyboard.press('Control+z');
  expect(await column(page, 'B')).toEqual(['Cleo', 'Ada', 'Bo', 'Dan']);
  expectNoPageErrors(pageErrors);
});
