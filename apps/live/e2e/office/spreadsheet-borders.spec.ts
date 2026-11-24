import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// Borders (plan 0020 Phase 9 box 3; docs/specs/029-sheets/formatting.md "Borders", D209): the toolbar's Borders panel
// draws a placement in the line and colour chosen, the chosen line stays for the next, and Alt+Shift+6 takes them off.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

// The drawn sides of the cells, as the grid's border layer styles them.
const drawn = (page: Page, side: 'Top' | 'Bottom' | 'Left' | 'Right') =>
  page
    .getByRole('grid', { name: 'Sheet1 grid' })
    .locator('[data-sheet-cells] div')
    .evaluateAll(
      (els, s) =>
        els
          .map((el) => (el as HTMLElement).style[`border${s}` as 'borderTop'])
          .filter((v) => v !== ''),
      side,
    );

test('the Borders panel draws a placement in the chosen double line, and Alt+Shift+6 clears', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'B2:C3');

  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await toolbar.getByRole('button', { name: 'Borders' }).click();
  const panel = page.getByRole('dialog', { name: 'Borders' });
  await panel.getByRole('button', { name: 'Border Style' }).click();
  await panel.getByRole('radio', { name: 'Double' }).click();
  await panel.getByRole('button', { name: 'Border Colour' }).click();
  await panel
    .getByRole('group', { name: 'Border Colour' })
    .getByRole('group', { name: 'Dark' })
    .getByRole('button', { name: 'Red' })
    .click();
  await page.screenshot({
    path: test.info().outputPath('borders-panel.png'),
    animations: 'disabled',
  });
  await panel.getByRole('button', { name: 'Outer Borders' }).click();
  await expect(panel).toBeHidden();
  await expect.poll(() => drawn(page, 'Top')).toHaveLength(2);
  expect((await drawn(page, 'Top'))[0]).toMatch(/^3px double rgb\(/);
  await page.screenshot({
    path: test.info().outputPath('borders-drawn.png'),
    animations: 'disabled',
  });

  // The line stays chosen: Horizontal draws the line between the two rows in it too.
  await toolbar.getByRole('button', { name: 'Borders' }).click();
  await panel.getByRole('button', { name: 'Horizontal Borders' }).click();
  await expect.poll(async () => (await drawn(page, 'Bottom')).length).toBe(4);

  // Alt+Shift+6 takes every border off the selection.
  await select(page, 'B2:C3');
  await page.keyboard.press('Alt+Shift+Digit6');
  await expect.poll(() => drawn(page, 'Top')).toHaveLength(0);
  expectNoPageErrors(pageErrors);
});
