import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// The spreadsheet's menus (plan 0020 Phase 8 box 1; docs/specs/029-sheets/surface.md "Menu bar", D125): Google's
// eight menus less Extensions, every planned row an item, those not built yet dimmed; Format › Text › Bold bolds the
// active cell and ticks, Edit › Undo takes it back, Insert › Rows counts the selection, the toolbar bolds and sizes
// ("Toolbar", D128), and the keys stay in the grid.

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

  // The toolbar (surface.md "Toolbar"): Bold pressed from it ticks the menu's Bold, and a size typed in its field.
  await select(page, 'A3');
  const toolbar = page.getByRole('toolbar');
  const bold = toolbar.getByRole('button', { name: /^Bold/ });
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  const size = toolbar.getByRole('combobox', { name: /Font Size/i });
  await size.fill('14');
  await size.press('Enter');
  await select(page, 'A3');
  await expect(size).toHaveValue('14');
  await expect(toolbar.getByRole('button', { name: 'Insert Chart' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.screenshot({ path: test.info().outputPath('toolbar.png'), animations: 'disabled' });

  // Font Size runs to Google's 400 points (formatting.md "Font Size"), where plus stops.
  await size.fill('400');
  await size.press('Enter');
  await select(page, 'A3');
  await expect(size).toHaveValue('400');
  await expect(toolbar.getByRole('button', { name: /^Increase Font Size/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.screenshot({
    path: test.info().outputPath('font-size-400.png'),
    animations: 'disabled',
  });

  // The menu's Alt key opens it (surface.md "Menu bar"): Chrome's Alt+D for Data.
  await select(page, 'B1');
  await page.keyboard.press('Alt+d');
  await expect(page.getByRole('menuitem', { name: 'Sort Sheet', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expectNoPageErrors(pageErrors);
});

// docs/specs/029-sheets/keyboard-shortcuts.md; surface.md "Menu bar": items show their keys, Ctrl+/ lists every one,
// a format key runs its item through the shell, and Ctrl+Z, the editor's own, still takes it back.
test('the menus show their keys and Ctrl+/ lists the grid’s own', async ({ page, pageErrors }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'A1');
  await page.keyboard.type('Total');
  await page.keyboard.press('Enter');

  const undo = await officeMenuItem(page, ['Edit', 'Undo']);
  await expect(undo).toContainText('Ctrl+Z');
  await expect(page.getByRole('menuitem', { name: /^Copy/ })).toContainText('Ctrl+C');
  await page.screenshot({
    path: test.info().outputPath('edit-menu-keys.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');

  await select(page, 'A1');
  await page.keyboard.press('Control+/');
  const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dialog).toBeVisible();
  const selectColumn = dialog
    .locator('div', { has: page.getByText('Select column', { exact: true }) })
    .last();
  await expect(selectColumn).toContainText('Ctrl+Space');
  await expect(selectColumn).not.toContainText('Coming soon');
  await page.screenshot({
    path: test.info().outputPath('shortcuts-dialog.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  const bold = page.getByRole('toolbar').getByRole('button', { name: /^Bold/ });
  await select(page, 'A1');
  await page.keyboard.press('Control+b');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+z');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  expectNoPageErrors(pageErrors);
});

// grid-and-editing.md "Clipboard" (D142, D144): Paste Special › Transposed turns the copied row into a column, and
// Conditional Formatting Only says when the copy holds none.
test('Paste Special turns a copied row into a column', async ({ page, context, pageErrors }) => {
  test.setTimeout(120_000);
  // Paste Special reads the system clipboard, as a menu item must: the browser asks first.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'A1');
  await page.keyboard.type('North');
  await page.keyboard.press('Tab');
  await page.keyboard.type('South');
  await page.keyboard.press('Enter');
  await select(page, 'A1:B1');
  await page.keyboard.press('ControlOrMeta+c');
  await select(page, 'D1');
  const transposed = await officeMenuItem(page, ['Edit', 'Paste Special', 'Transposed']);
  await page.screenshot({
    path: test.info().outputPath('paste-special.png'),
    animations: 'disabled',
  });
  await transposed.click();
  // The paste lands once the clipboard is read.
  await expect.poll(() => inputOf(page, 'D1')).toBe('North');
  expect(await inputOf(page, 'D2')).toBe('South');
  await (
    await officeMenuItem(page, ['Edit', 'Paste Special', 'Conditional Formatting Only'])
  ).click();
  await expect(page.getByText('The copied cells hold no conditional formatting')).toBeVisible();
  expectNoPageErrors(pageErrors);
});

// Google Sheets' clipboard both ways (grid-and-editing.md "Clipboard", D152, D154): a copy writes formulas as R1C1
// in `data-sheets-formula` and merges as spans; Google's HTML pasted back keeps its formula.
test('the clipboard speaks Google Sheets’ HTML both ways', async ({
  page,
  context,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'A1');
  await page.keyboard.type('3');
  await page.keyboard.press('Tab');
  await page.keyboard.type('=A1*2');
  await page.keyboard.press('Enter');
  await select(page, 'A1:B1');
  await page.keyboard.press('ControlOrMeta+c');
  const html = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const blob = await items[0]!.getType('text/html');
    return blob.text();
  });
  expect(html).toContain('data-sheets-formula="=R[0]C[-1]*2"');

  // As Google Sheets writes it: a value, a formula beside it, and a cell spanning two columns below.
  const google =
    '<meta charset="utf-8"><google-sheets-html-origin><table data-sheets-root="1"><tr><td>5</td>' +
    '<td data-sheets-formula="=R[0]C[-1]+1" style="font-weight:bold">6</td></tr>' +
    '<tr><td colspan="2">Notes</td></tr></table>';
  await page.evaluate(async (text) => {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([text], { type: 'text/html' }),
        'text/plain': new Blob(['5\t6\nNotes'], { type: 'text/plain' }),
      }),
    ]);
  }, google);
  await select(page, 'D3');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => inputOf(page, 'E3')).toBe('=D3+1');
  expect(await inputOf(page, 'D4')).toBe('Notes');
  await page.screenshot({
    path: test.info().outputPath('google-paste.png'),
    animations: 'disabled',
  });
  expectNoPageErrors(pageErrors);
});
