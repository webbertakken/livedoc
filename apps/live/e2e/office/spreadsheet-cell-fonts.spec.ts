import { expect, expectNoPageErrors, test } from '../fixtures';

// A cell's font (plan 0020 Phase 9 box 2; docs/specs/029-sheets/formatting.md "Text and colour", D201): the toolbar's
// Font shows Arial for a cell with none, and a family chosen draws the selection in LiveDoc's own faces of it.

const READY = '[data-spreadsheet-surface="ready"]';

test('Font shows Arial and draws a chosen family in its served faces', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill('A1');
  await nameBox.press('Enter');
  await page.keyboard.type('Quarterly total');
  await page.keyboard.press('Enter');
  await nameBox.fill('A1');
  await nameBox.press('Enter');

  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await expect(toolbar.getByRole('button', { name: 'Font: Arial' })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Font: Arial' }).click();
  await page.screenshot({ path: test.info().outputPath('font-menu.png'), animations: 'disabled' });
  await page.getByRole('menuitemradio', { name: 'Roboto Mono' }).click();

  await expect(toolbar.getByRole('button', { name: 'Font: Roboto Mono' })).toBeVisible();
  // The face is fetched only because the cell's text uses it.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.fonts].some(
          (face) => face.family.includes('LiveDoc Roboto Mono') && face.status === 'loaded',
        ),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath('cell-font.png'), animations: 'disabled' });
  expectNoPageErrors(pageErrors);
});
