import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Filter views (plan 0020 Phase 10 box 1; docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers"):
// Create Filter View opens a named view, its filter the opener's alone; its link opens it again; Change View lists it.

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

test('a filter view filters for its opener, opens from its link and from Change View', async ({
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

  await select(page, 'A2');
  await (await officeMenuItem(page, ['Data', 'Create Filter View'])).click();
  const bar = page.getByRole('toolbar', { name: 'Filter view' });
  await expect(bar.getByRole('textbox', { name: 'Name' })).toHaveValue('Filter 1');
  await expect(bar.getByRole('textbox', { name: 'Range' })).toHaveValue('A1:B4');

  await page.getByRole('button', { name: 'Filter column 1' }).click();
  await page.getByRole('checkbox', { name: /plum/ }).uncheck();
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(shown(page, 'plum')).toHaveCount(0);
  await expect(shown(page, 'pear')).toHaveCount(1);
  await bar.getByRole('textbox', { name: 'Name' }).fill('No plums');
  await bar.getByRole('textbox', { name: 'Name' }).press('Enter');
  await expect(page).toHaveURL(/[?&]fview=[^&#]+\.[a-z0-9]+/);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-view-open.png') });

  // Its link opens it again after a reload.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(bar.getByRole('textbox', { name: 'Name' })).toHaveValue('No plums');
  await expect(shown(page, 'plum')).toHaveCount(0);

  // Closed, the sheet shows every row and the address names no view.
  await bar.getByRole('button', { name: 'Close Filter View' }).click();
  await expect(bar).toBeHidden();
  await expect(shown(page, 'plum')).toHaveCount(1);
  await expect(page).not.toHaveURL(/fview=/);

  // Change View lists it, and opens it.
  await (await officeMenuItem(page, ['Data', 'Change View', 'No plums'])).click();
  await expect(bar).toBeVisible();
  await expect(shown(page, 'plum')).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-view-change-view.png') });
  expectNoPageErrors(pageErrors);
});

async function inputOf(page: Page, cell: string): Promise<string> {
  await select(page, cell);
  return page.getByRole('textbox', { name: 'Formula bar' }).first().inputValue();
}

// The row numbers down the side, top to bottom as drawn.
const rowNumbers = (page: Page) =>
  page.locator('[role="rowheader"][aria-rowindex]').evaluateAll((headers) =>
    headers
      .map((h) => ({ n: h.textContent ?? '', y: h.getBoundingClientRect().y }))
      .sort((a, b) => a.y - b.y)
      .map((h) => h.n)
      .slice(0, 5),
  );

// The drawn order (data-tools.md "The drawn order", D491-D495): a view's Sort A to Z draws its rows by that column
// for its opener, each row keeping its own number; moves, copying and pasting land on the stored rows drawn there.
test('a filter view sorted draws its rows in an order of its own, edits landing on the rows drawn', async ({
  page,
  context,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Data', 'Create Filter View'])).click();
  await page.getByRole('button', { name: 'Filter column 2' }).click();
  await page.getByRole('button', { name: 'Sort A to Z' }).click();
  await expect.poll(() => rowNumbers(page)).toEqual(['1', '4', '2', '3', '5']);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-view-sorted.png') });

  // Down from the header goes to plum, drawn next; Shift + Down takes apple too; the copy pastes down the rows drawn.
  await select(page, 'A1');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A4');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('ControlOrMeta+c');
  await select(page, 'D4');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => inputOf(page, 'D4')).toBe('plum');
  expect(await inputOf(page, 'D2')).toBe('apple');
  expect(await inputOf(page, 'E2')).toBe('3');

  // Typing lands on the stored row drawn there; closing the view draws the sheet's order, the cells never moved.
  await select(page, 'A4');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.type('kiwi');
  await page.keyboard.press('Enter');
  await page
    .getByRole('toolbar', { name: 'Filter view' })
    .getByRole('button', { name: 'Close Filter View' })
    .click();
  await expect.poll(() => rowNumbers(page)).toEqual(['1', '2', '3', '4', '5']);
  expect(await inputOf(page, 'A2')).toBe('kiwi');
  expect(await inputOf(page, 'A4')).toBe('plum');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-view-sorted-closed.png') });
  expectNoPageErrors(pageErrors);
});
