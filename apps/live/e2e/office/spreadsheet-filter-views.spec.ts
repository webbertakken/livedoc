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

test('a group by view groups a table under its headers, collapsed by its opener alone', async ({
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
    ['pear', '3'],
    ['apple', '8'],
    ['pear', '1'],
    ['apple', '2'],
    ['fig', '5'],
  ];
  for (const [i, [fruit, n]] of rows.entries()) {
    await typeInto(page, `A${i + 2}`, fruit!);
    await typeInto(page, `B${i + 2}`, n!);
  }
  await select(page, 'A3');
  await (await officeMenuItem(page, ['Format', 'Convert to Table'])).click();
  await expect(page.getByRole('button', { name: 'Table1 table menu' })).toBeVisible();

  // Data › Create Group by View groups by the active cell's column: apple, fig, pear, each with its count.
  await select(page, 'A3');
  await (await officeMenuItem(page, ['Data', 'Create Group by View'])).click();
  const bar = page.getByRole('toolbar', { name: 'Filter view' });
  await expect(bar.getByRole('textbox', { name: 'Name' })).toHaveValue('Group 1');
  await expect(bar.getByRole('textbox', { name: 'Range' })).toHaveAttribute('readonly', '');
  const openers = page.getByRole('button', { name: /^(Collapse|Expand) .*, \d+ rows?$/ });
  await expect(openers).toHaveText(['▾', '▾', '▾']);
  expect(await openers.evaluateAll((b) => b.map((x) => x.getAttribute('aria-label')))).toEqual([
    'Collapse apple, 2 rows',
    'Collapse fig, 1 row',
    'Collapse pear, 2 rows',
  ]);
  await expect.poll(() => rowNumbers(page)).toEqual(['1', '2', '4', '6', '7']);
  // Each group counts by the first column; Count's ▾ sums it for every group (D501).
  await expect(page.getByText('Count 2', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Count aggregation' }).first().click();
  await page
    .getByRole('dialog', { name: 'Count aggregation' })
    .getByRole('button', { name: 'Sum' })
    .click();
  await expect(page.getByText('Sum 10', { exact: true })).toBeVisible();
  await expect(page.getByText('Sum 4', { exact: true })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('group-by-view.png') });

  // Collapsed for this person: its rows drawn at no height, the keys passing over them and over every header.
  await page.getByRole('button', { name: 'Collapse apple, 2 rows' }).click();
  await expect(page.getByRole('button', { name: 'Expand apple, 2 rows' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect.poll(() => rowNumbers(page)).toEqual(['1', '2', '7', '3', '5']);
  await select(page, 'A2');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A7');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('A3');
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('group-by-view-collapsed.png') });

  // The table menu's Group By lists its columns; Change View lists both.
  await page.getByRole('button', { name: 'Table1 table menu' }).click();
  const tableMenu = page.getByRole('dialog', { name: 'Table1 table menu' });
  await tableMenu.getByRole('button', { name: 'Group By' }).click();
  await tableMenu.getByRole('button', { name: 'Count' }).click();
  await expect(bar.getByRole('textbox', { name: 'Name' })).toHaveValue('Group 2');
  await expect(openers).toHaveCount(5);
  await (await officeMenuItem(page, ['Data', 'Change View', 'Group 1'])).click();
  await expect(bar.getByRole('textbox', { name: 'Name' })).toHaveValue('Group 1');
  await expect(page.getByRole('button', { name: 'Expand apple, 2 rows' })).toBeVisible();
  expectNoPageErrors(pageErrors);
});

test('the toolbar’s filter button makes and opens views; a table chip in row 1 leaves its header readable', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  // Wide enough that the Insert group's controls are on the bar, not folded into More.
  await page.setViewportSize({ width: 1600, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  for (const [i, [fruit, n]] of [
    ['Fruit', 'Count'],
    ['apple', '3'],
    ['pear', '8'],
  ].entries()) {
    await typeInto(page, `A${i + 1}`, fruit!);
    await typeInto(page, `B${i + 1}`, n!);
  }
  await select(page, 'A2');
  const options = page.getByRole('button', { name: 'Create a Filter options' });
  await options.click();
  await page.getByRole('menuitem', { name: /Create Filter View/ }).click();
  const bar = page.getByRole('toolbar', { name: 'Filter view' });
  await expect(bar.getByRole('textbox', { name: 'Name' })).toHaveValue('Filter 1');
  await bar.getByRole('button', { name: 'Close Filter View' }).click();
  // The saved view is listed under the creating items, and opens from there.
  await options.click();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-button-menu.png') });
  await page.getByRole('menuitemradio', { name: 'Filter 1' }).click();
  await expect(bar.getByRole('textbox', { name: 'Name' })).toHaveValue('Filter 1');
  await bar.getByRole('button', { name: 'Close Filter View' }).click();
  // The funnel itself turns the sheet's filter on, and is named Remove Filter while it is.
  await page.getByRole('button', { name: 'Create a Filter', exact: true }).click();
  const remove = page.getByRole('button', { name: 'Remove Filter', exact: true });
  await expect(remove).toHaveAttribute('aria-pressed', 'true');
  await remove.click();
  await expect(page.getByRole('button', { name: 'Create a Filter', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  // A table from A1: its chip sits above the header's first cell, over the column letters, not over "Fruit".
  await select(page, 'A2');
  await (await officeMenuItem(page, ['Format', 'Convert to Table'])).click();
  const chip = page.getByRole('button', { name: 'Table1 table menu' });
  await expect(chip).toBeVisible();
  const fruit = shown(page, 'Fruit').first();
  const [chipBox, fruitBox] = [await chip.boundingBox(), await fruit.boundingBox()];
  expect(chipBox!.y + chipBox!.height).toBeLessThanOrEqual(fruitBox!.y + 1);
  // Drawn on top: the point at its middle is the chip's, not a column letter's.
  expect(
    await chip.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return (
        document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('button') === el
      );
    }),
  ).toBe(true);
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('table-chip-row-one.png') });
  expectNoPageErrors(pageErrors);
});

// data-tools.md "Filters, filter views and slicers" (D504): a cell's Filter by Cell Value makes the sheet's filter
// keeping the cell's value, one undo step; Ctrl+Alt+R opens the filter menu of the active cell's column.
test('Filter by Cell Value filters by the cell, undone in one step; Ctrl+Alt+R opens its filter menu', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const rows = [
    ['Fruit', 'Count'],
    ['apple', '3'],
    ['pear', '8'],
    ['plum', '1'],
    ['pear', '2'],
  ];
  for (const [i, [fruit, n]] of rows.entries()) {
    await typeInto(page, `A${i + 1}`, fruit!);
    await typeInto(page, `B${i + 1}`, n!);
  }

  const pear = shown(page, 'pear').first();
  const box = (await pear.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page
    .getByRole('menu', { name: 'Context menu' })
    .getByRole('menuitem', { name: 'Filter by Cell Value' })
    .click();
  await expect(shown(page, 'apple')).toHaveCount(0);
  await expect(shown(page, 'plum')).toHaveCount(0);
  await expect(shown(page, 'pear')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Filter column 1' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-by-cell-value.png') });

  // One undo step: the filter and its condition go together.
  await page.keyboard.press('Control+z');
  await expect(shown(page, 'apple')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Filter column 1' })).toHaveCount(0);
  await page.keyboard.press('Control+y');
  await expect(shown(page, 'apple')).toHaveCount(0);

  // Ctrl+Alt+R on a filtered cell: its column's filter menu, the one value ticked.
  await select(page, 'A3');
  await page.keyboard.press('Control+Alt+r');
  const menu = page.getByRole('dialog', { name: 'Filter column' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('checkbox', { name: /pear/ })).toBeChecked();
  await expect(menu.getByRole('checkbox', { name: /apple/ })).not.toBeChecked();
  await settle(page);
  await page.screenshot({ path: test.info().outputPath('filter-menu-by-key.png') });
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // Outside the filter it opens nothing.
  await select(page, 'D3');
  await page.keyboard.press('Control+Alt+r');
  await expect(page.getByRole('dialog', { name: 'Filter column' })).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
