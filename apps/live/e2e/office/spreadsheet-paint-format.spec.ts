import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from '../fixtures';

// Paint Format (plan 0020 Phase 9 box 4; docs/specs/029-sheets/formatting.md "Paint format and clearing"): a press holds
// the selection's formats, the next range selected takes them and it lets go; a double-click keeps it on.

const READY = '[data-spreadsheet-surface="ready"]';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

async function clickCell(page: Page, col: number, row: number) {
  const letter = (await page
    .locator(`[role="columnheader"][aria-colindex="${col}"]`)
    .boundingBox())!;
  const number = (await page.locator(`[role="rowheader"][aria-rowindex="${row}"]`).boundingBox())!;
  await page.mouse.click(letter.x + letter.width / 2, number.y + number.height / 2);
}

test('Paint Format paints the next range, and a double-click keeps it on', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  const bold = toolbar.getByRole('button', { name: /^Bold/ });
  const paint = toolbar.getByRole('button', { name: 'Paint Format' });

  await select(page, 'A1');
  await bold.click();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');

  // One press: C3 takes A1's bold, and Paint Format lets go.
  await paint.click();
  await expect(paint).toHaveAttribute('aria-pressed', 'true');
  await clickCell(page, 3, 3);
  await expect(paint).toHaveAttribute('aria-pressed', 'false');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');

  // A double-click keeps it on over several ranges; Escape lets go.
  await select(page, 'A1');
  await paint.dblclick();
  await clickCell(page, 4, 4);
  await clickCell(page, 5, 5);
  await expect(paint).toHaveAttribute('aria-pressed', 'true');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(paint).toHaveAttribute('aria-pressed', 'false');
  await select(page, 'D4');
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await select(page, 'B2');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  expectNoPageErrors(pageErrors);
});
