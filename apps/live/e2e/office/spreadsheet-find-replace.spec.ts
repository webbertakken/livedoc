import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// Find and Replace (plan 0020 Phase 10 box 6; docs/specs/029-sheets/data-tools.md "Find and replace"): the Find bar's
// More Options opens the dialog on its text; Find goes from sheet to sheet; Replace All reaches every sheet as one
// change, counting each match, and one undo puts every sheet back.

const READY = '[data-spreadsheet-surface="ready"]';
const sheets = (page: Page) => page.getByRole('tablist', { name: 'Sheets' });

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

const openSheet = (page: Page, name: string) =>
  sheets(page).getByRole('tab', { name, exact: true }).click();

test('Find and Replace finds across sheets and replaces every match in one step', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await typeInto(page, 'A1', 'banana');
  await typeInto(page, 'A2', 'Apple pie');
  await typeInto(page, 'B1', '101');
  await page.getByRole('button', { name: 'Add Sheet' }).click();
  await expect(sheets(page).getByRole('tab', { name: 'Sheet2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await typeInto(page, 'C3', 'apple');
  await openSheet(page, 'Sheet1');
  await select(page, 'A1');

  // Ctrl+F's bar, then More Options: the dialog on the bar's text.
  await page.keyboard.press('Control+f');
  const bar = page.getByRole('search', { name: 'Find in sheet' });
  await bar.getByLabel('Find').fill('apple');
  await bar.getByRole('button', { name: 'More Options' }).click();
  const dialog = page.getByRole('dialog', { name: 'Find and Replace' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Find', { exact: true })).toHaveValue('apple');

  // Find: A2 here, then C3 on Sheet2, then round again.
  await dialog.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A2');
  await dialog.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(sheets(page).getByRole('tab', { name: 'Sheet2', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('C3');
  await dialog.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(dialog.getByText('No more results, looping around')).toBeVisible();

  // Replace All, case aside, in both sheets; numbers stay numbers.
  await dialog.getByLabel('Replace With').fill('pear');
  await dialog.getByRole('button', { name: 'Replace All' }).click();
  await expect(dialog.getByText('Replaced 2 instances of "apple" with "pear"')).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running'),
  );
  await page.screenshot({ path: test.info().outputPath('find-and-replace.png') });
  await dialog.getByLabel('Find', { exact: true }).fill('1');
  await dialog.getByLabel('Replace With').fill('2');
  await dialog.getByRole('combobox', { name: 'Search' }).selectOption({ label: 'This Sheet' });
  await dialog.getByRole('button', { name: 'Replace All' }).click();
  await expect(dialog.getByText('Replaced 2 instances of "1" with "2"')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  await openSheet(page, 'Sheet1');
  expect(await inputOf(page, 'A2')).toBe('pear pie');
  expect(await inputOf(page, 'B1')).toBe('202');

  // One undo step per Replace All, across sheets.
  await page.keyboard.press('Control+z');
  expect(await inputOf(page, 'B1')).toBe('101');
  await page.keyboard.press('Control+z');
  expect(await inputOf(page, 'A2')).toBe('Apple pie');
  await openSheet(page, 'Sheet2');
  expect(await inputOf(page, 'C3')).toBe('apple');
  expectNoPageErrors(pageErrors);
});
