import type { Page } from '@playwright/test';
import { createInMode, expect, expectNoPageErrors, seedTab, switchToTab, test } from './fixtures';

// docs/specs/007-editor/split-view.md "How the editor fits in its pane": what the canvas draws over itself while a
// gesture runs lands under the pointer in either pane. A Sketch tab in the right pane, on a 1786 px wide window at
// 1.25x, draws its selection box exactly over the drag.

test.use({
  colorScheme: 'dark',
  viewport: { width: 1786, height: 930 },
  deviceScaleFactor: 1.25,
});

const square = (id: string, x: number) => ({
  id,
  type: 'shape',
  shape: 'square',
  x,
  y: 200,
  width: 120,
  height: 120,
  label: '',
});

// Tab 1 (the seeded one) opened beside Tab 2, from its own tab menu: the active tab takes the right pane, and the
// editor with it.
async function openSeededTabOnTheRight(page: Page): Promise<void> {
  await page.locator('[data-document-group]').getByRole('button', { name: 'Add tab' }).click();
  await page.getByRole('menuitem', { name: 'Tab', exact: true }).click();
  // A new tab opens on its empty canvas, its start closed (docs/specs/007-editor/start-diagramming.md).
  await expect(page.getByRole('button', { name: 'Show Templates' })).toBeVisible();
  await switchToTab(page, 'Tab 1');
  await page.getByRole('button', { name: 'Tab menu' }).click();
  await page
    .getByRole('dialog', { name: 'Tab menu' })
    .getByRole('button', { name: 'Side by Side' })
    .click();
  await expect(page.locator('[data-editor-viewport="pane"]')).toHaveCount(1);
}

test.describe('Side by side: the right pane', () => {
  test('draws the selection box over the drag, and selects what it covers', async ({
    page,
    pageErrors,
  }) => {
    await createInMode(page, 'draw');
    const start = page.getByRole('region', { name: 'Start Sketching' });
    await start.getByRole('button', { name: 'Close' }).click();
    await start.waitFor({ state: 'detached' });
    await seedTab(page, [square('left', 100), square('right', 300)]);
    await openSeededTabOnTheRight(page);

    const pane = (await page.locator('[data-editor-viewport="pane"]').boundingBox())!;
    expect(pane.x).toBeGreaterThan(0);
    const left = (await page.locator('[data-element-id="left"]').first().boundingBox())!;
    const right = (await page.locator('[data-element-id="right"]').first().boundingBox())!;
    expect(left.x).toBeGreaterThan(pane.x);

    // Put any pen down: the select tool draws the selection box.
    await page.keyboard.press('Escape');
    const from = { x: left.x - 30, y: left.y - 30 };
    const to = { x: right.x + right.width + 30, y: right.y + right.height + 30 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });

    const marquee = page.locator('[data-marquee]');
    // Opt-in evidence for a pull request: the window mid-drag.
    if (process.env.E2E_SHOT) await page.screenshot({ path: process.env.E2E_SHOT });
    await expect(marquee).toBeVisible();
    const drawn = (await marquee.boundingBox())!;
    expect(drawn.x).toBeCloseTo(from.x, 0);
    expect(drawn.y).toBeCloseTo(from.y, 0);
    expect(drawn.width).toBeCloseTo(to.x - from.x, 0);
    expect(drawn.height).toBeCloseTo(to.y - from.y, 0);

    await page.mouse.up();
    await expect(marquee).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: 'Selected Elements (2)' })).toBeVisible();
    expectNoPageErrors(pageErrors);
  });
});
