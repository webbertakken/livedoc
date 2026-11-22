import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The spreadsheet's menus (plan 0020 Phase 8 box 1; docs/specs/029-sheets/surface.md "Menu bar", D125): Google's
// eight menus less Extensions, every planned row an item, those not built yet dimmed; Format › Text › Bold bolds the
// active cell and ticks, Edit › Undo takes it back, Insert › Rows counts the selection, and the keys stay in the grid.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, ref: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(ref);
  await nameBox.press('Enter');
}

async function inputOf(page: Page, cell: string): Promise<string> {
  await select(page, cell);
  return page.getByRole('textbox', { name: 'Formula bar' }).first().inputValue();
}

async function boldTicked(page: Page): Promise<string | null> {
  const bold = await officeMenuItem(page, ['Format', 'Text', 'Bold']);
  const ticked = await bold.getAttribute('aria-checked');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  return ticked;
}

test('the menus run what the grid does, and dim what is still to come', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const bar = page.getByRole('menubar', { name: 'Menu bar' });
  await expect(bar.getByRole('menuitem')).toHaveText([
    'File',
    'Edit',
    'View',
    'Insert',
    'Format',
    'Data',
    'Tools',
    'Help',
  ]);

  // Typed into A1; Bold from the menu bolds it and ticks, the keys still in the grid after.
  await select(page, 'A1');
  await page.keyboard.type('Total');
  await page.keyboard.press('Enter');
  await select(page, 'A1');
  await (await officeMenuItem(page, ['Format', 'Text', 'Bold'])).click();
  await select(page, 'A1');
  expect(await boldTicked(page)).toBe('true');
  await page.screenshot({
    path: test.info().outputPath('format-text-menu.png'),
    animations: 'disabled',
  });

  // Edit › Undo takes the bold back, one step.
  await (await officeMenuItem(page, ['Edit', 'Undo'])).click();
  await select(page, 'A1');
  expect(await boldTicked(page)).toBe('false');

  // Two rows selected: Insert › Rows counts them, and the value moves down two.
  await select(page, 'A1:A2');
  const insert = await officeMenuItem(page, ['Insert', 'Rows', 'Insert 2 Rows Above']);
  await page.screenshot({
    path: test.info().outputPath('insert-rows-menu.png'),
    animations: 'disabled',
  });
  await insert.click();
  expect(await inputOf(page, 'A3')).toBe('Total');

  // A row not built yet is drawn, dimmed.
  const pivot = await officeMenuItem(page, ['Insert', 'Pivot Table']);
  await expect(pivot).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  // The menu's Alt key opens it (surface.md "Menu bar"): Chrome's Alt+D for Data.
  await select(page, 'B1');
  await page.keyboard.press('Alt+d');
  await expect(page.getByRole('menuitem', { name: 'Sort Sheet', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expectNoPageErrors(pageErrors);
});
