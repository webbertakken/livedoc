import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// Rows and columns (plan 0020 Phase 8 box 7; docs/specs/029-sheets/grid-and-editing.md "Rows, columns and cells"):
// the keys that hide, show, insert and delete, the Resize dialog, and groups with their outline bar.

const READY = '[data-spreadsheet-surface="ready"]';

async function openSpreadsheet(page: Page) {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
}

const rowHeader = (page: Page, n: number) =>
  page.locator(`[role="rowheader"][aria-rowindex="${n}"]`);
const colHeader = (page: Page, n: number) =>
  page.locator(`[role="columnheader"][aria-colindex="${n}"]`);

test('keys hide and show rows, and open the insert menu over cells', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  const go = async (ref: string) => {
    await nameBox.fill(ref);
    await nameBox.press('Enter');
  };
  await go('B2:C3');
  await page.keyboard.press('Control+Alt+Digit9');
  await expect(rowHeader(page, 2)).toHaveCount(0);
  await expect(rowHeader(page, 3)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show Rows 2 to 3' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('rows-hidden.png'),
    animations: 'disabled',
  });
  await go('A1:A4');
  await page.keyboard.press('Control+Shift+Digit9');
  await expect(rowHeader(page, 2)).toBeVisible();
  await expect(rowHeader(page, 3)).toBeVisible();

  await go('B2');
  await page.keyboard.press('Control+Alt+Equal');
  const menu = page.getByRole('dialog', { name: 'Insert menu' });
  await expect(menu.getByRole('button', { name: 'Insert 1 row above' })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('insert-menu.png'),
    animations: 'disabled',
  });
  await menu.getByRole('button', { name: 'Insert cells and shift down' }).click();
  await expect(menu).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});

test('the Resize dialog sets a column’s width', async ({ page, pageErrors }) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  // The letters are drawn under the grid's own pointer handling: pressed where they are drawn.
  const letterB = (await colHeader(page, 2).boundingBox())!;
  await page.mouse.click(letterB.x + letterB.width / 2, letterB.y + letterB.height / 2, {
    button: 'right',
  });
  await page.getByRole('button', { name: 'Resize column B' }).click();
  const dialog = page.getByRole('dialog', { name: 'Resize column B' });
  const field = dialog.getByRole('textbox', { name: /column width in pixels/ });
  // The column's width as drawn.
  await expect(field).toHaveValue(String(Math.round(letterB.width)));
  await field.fill('60');
  await page.screenshot({
    path: test.info().outputPath('resize-dialog.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await colHeader(page, 2).boundingBox())?.width).toBe(60);
  expectNoPageErrors(pageErrors);
});

test('groups rows by key, collapses them by the control and expands them again', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await openSpreadsheet(page);
  // The numbers are drawn under the grid's own pointer handling: pressed where they are drawn.
  const selectRows3to5 = async () => {
    const three = (await rowHeader(page, 3).boundingBox())!;
    const five = (await rowHeader(page, 5).boundingBox())!;
    await page.mouse.click(three.x + three.width / 2, three.y + three.height / 2);
    await page.keyboard.down('Shift');
    await page.mouse.click(five.x + five.width / 2, five.y + five.height / 2);
    await page.keyboard.up('Shift');
  };
  await selectRows3to5();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  const collapse = page.getByRole('button', { name: 'Collapse rows 3 - 5' });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await page.screenshot({
    path: test.info().outputPath('group-expanded.png'),
    animations: 'disabled',
  });
  await collapse.click();
  for (const n of [3, 4, 5]) await expect(rowHeader(page, n)).toHaveCount(0);
  const expand = page.getByRole('button', { name: 'Expand rows 3 - 5' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({
    path: test.info().outputPath('group-collapsed.png'),
    animations: 'disabled',
  });
  await expand.click();
  for (const n of [3, 4, 5]) await expect(rowHeader(page, n)).toBeVisible();
  // Ungrouped by key, the bar goes.
  await selectRows3to5();
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await expect(page.getByRole('button', { name: /rows 3 - 5/ })).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
