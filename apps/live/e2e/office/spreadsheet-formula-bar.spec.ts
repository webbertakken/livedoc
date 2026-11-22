import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// The formula bar and the selection's summary (plan 0020 Phase 8 box 2; docs/specs/029-sheets/surface.md "Formula
// bar", "Sheet bar", D129 to D132): the sheet bar sums a selection and lists every kind with its value, a pick kept;
// text alone counts; the name box's arrow lists the sheet's names and a pick selects one; F1 hides the help card.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, ref: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(ref);
  await nameBox.press('Enter');
}

async function typeInto(page: Page, cell: string, input: string) {
  await select(page, cell);
  await page.keyboard.type(input);
  await page.keyboard.press('Enter');
}

test('the sheet bar sums a selection, and the formula bar names and helps', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();

  await typeInto(page, 'A1', '1200');
  await typeInto(page, 'A2', '34');
  await typeInto(page, 'A3', 'note');

  // One cell: no summary. Three: the sum of the numbers, written as the active cell writes a number (automatic).
  const summary = page.locator('[data-sheet-summary]');
  await select(page, 'A1');
  await expect(summary).toBeEmpty();
  await select(page, 'A1:A3');
  const button = summary.getByRole('button', { name: /^Selection Summary/ });
  await expect(button).toContainText('Sum: 1234');
  await button.click();
  await expect(page.getByRole('menuitemradio')).toHaveText([
    'Sum: 1234',
    'Average: 617',
    'Min: 34',
    'Max: 1200',
    'Count: 3',
    'Count Numbers: 2',
  ]);
  await page.screenshot({
    path: test.info().outputPath('summary-menu.png'),
    animations: 'disabled',
  });
  await page.getByRole('menuitemradio', { name: 'Count Numbers: 2' }).click();
  await expect(button).toContainText('Count Numbers: 2');

  // Text alone: Count, whatever the pick (D132).
  await typeInto(page, 'B1', 'a');
  await typeInto(page, 'B2', 'b');
  await select(page, 'B1:B2');
  await expect(button).toContainText('Count: 2');

  // A name given in the name box is listed under its arrow; a pick selects its range (D129).
  await select(page, 'A1:A2');
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('Amounts');
  await nameBox.press('Enter');
  await select(page, 'D9');
  await page.getByRole('button', { name: 'Named Ranges' }).click();
  const amounts = page.getByRole('menuitem', { name: /Amounts/ });
  await expect(amounts).toContainText('A1:A2');
  await page.screenshot({
    path: test.info().outputPath('named-ranges.png'),
    animations: 'disabled',
  });
  await amounts.click();
  await expect(nameBox).toHaveValue('Amounts');

  // F1 hides the function help card while a formula is typed, and shows it again (D131).
  await select(page, 'C1');
  await page.keyboard.type('=SUM(');
  const card = page.getByRole('note');
  await expect(card).toContainText('SUM(');
  await page.keyboard.press('F1');
  await expect(card).toHaveCount(0);
  await page.keyboard.press('F1');
  await expect(card).toBeVisible();
  await page.keyboard.press('Escape');
  expectNoPageErrors(pageErrors);
});
