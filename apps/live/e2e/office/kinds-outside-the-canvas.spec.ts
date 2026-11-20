import { expect, test } from '../fixtures';

// How the editor hosts a tab outside the canvas (docs/specs/006-document/kinds-outside-the-canvas.md): a text document
// of one tab shows its surface with no canvas and no tab strip; a canvas tab added beside it brings the strip and the
// canvas; switching back finds the writing where it was left.

const BODY = '[role="textbox"][aria-label="Document body"]';
const SURFACE_READY = '[data-text-document-surface="ready"]';
const CANVAS = '[data-canvas-root]';

test('a text document hosts its surface alone, and keeps its place across a canvas tab', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(SURFACE_READY)).toBeVisible();

  // One tab outside the canvas: no canvas, no active tab segment; Add tab stays.
  await expect(page.locator(CANVAS)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /all tabs/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add tab' })).toBeVisible();

  // Enough writing to scroll, the caret left in the middle of it.
  await page.locator(BODY).click();
  for (let line = 1; line <= 60; line++) {
    await page.keyboard.type(`Line ${line}`);
    await page.keyboard.press('Enter');
  }
  const scroller = page.locator(`${SURFACE_READY} .overflow-y-auto`);
  await scroller.evaluate((el) => (el.scrollTop = 600));
  await page.getByText('Line 30', { exact: true }).click();
  await page.keyboard.press('End');
  // Where the writing rests once the editor has scrolled the caret into view.
  const settled = async () => {
    for (;;) {
      const at = await scroller.evaluate((el) => el.scrollTop);
      await page.waitForTimeout(200);
      if ((await scroller.evaluate((el) => el.scrollTop)) === at) return at;
    }
  };
  const left = await settled();

  // A canvas tab beside it: the strip shows, the canvas draws.
  await page.getByRole('button', { name: 'Add tab' }).click();
  await page.locator('[data-add-tab-row="tab"]').click();
  await expect(page.locator(CANVAS)).toBeVisible();
  await expect(page.locator(SURFACE_READY)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /all tabs/ })).toBeVisible();

  // Back to the writing: where it was scrolled, the caret where it was left.
  await page.getByRole('button', { name: /all tabs/ }).click();
  await page.getByRole('dialog', { name: 'Tabs' }).getByText('Untitled document').click();
  await expect(page.locator(SURFACE_READY)).toBeVisible();
  await expect(page.locator(CANVAS)).toHaveCount(0);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(left);
  // The caret is back in the writing, where it was left.
  await page.keyboard.type(' (here)');
  await expect(page.getByText('Line 30 (here)', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('back-to-the-writing.png') });
});
