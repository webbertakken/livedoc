import type { Page } from '@playwright/test';
import { createInMode, expect, expectNoPageErrors, seedTab, test } from './fixtures';

// docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo", "Selection and undo": a person's own deselect is an undo
// step that leaves the redo side alone, and undo and redo bring back the selection each step was made with. Sketch
// and Structured alike.

test.use({ colorScheme: 'dark' });

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

const MODES = [
  { mode: 'diagram', start: 'Start Diagramming' },
  { mode: 'draw', start: 'Start Sketching' },
] as const;

const both = (page: Page) => page.getByRole('toolbar', { name: 'Selected Elements (2)' });
const squares = (page: Page) => page.locator('[data-element-id="a"], [data-element-id="b"]');

async function selectBoth(page: Page): Promise<void> {
  const a = (await page.locator('[data-element-id="a"]').first().boundingBox())!;
  const b = (await page.locator('[data-element-id="b"]').first().boundingBox())!;
  await page.mouse.move(a.x - 30, a.y - 30);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width + 30, b.y + b.height + 30, { steps: 8 });
  await page.mouse.up();
  await expect(both(page)).toBeVisible();
}

// A press on empty canvas, well below the squares.
async function clickOff(page: Page): Promise<void> {
  const b = (await page.locator('[data-element-id="b"]').first().boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height + 200);
}

for (const { mode, start } of MODES) {
  test.describe(`Undo and the selection (${mode})`, () => {
    test.beforeEach(async ({ page }) => {
      await createInMode(page, mode);
      const screen = page.getByRole('region', { name: start });
      await screen.getByRole('button', { name: 'Close' }).click();
      await screen.waitFor({ state: 'detached' });
      await seedTab(page, [square('a', 100), square('b', 300)]);
      await page.keyboard.press('Escape');
    });

    test('undo brings back a selection a click off cleared, and redo clears it again', async ({
      page,
      pageErrors,
    }) => {
      await selectBoth(page);

      await clickOff(page);
      await expect(both(page)).toHaveCount(0);
      if (process.env.E2E_SHOT)
        await page.screenshot({ path: `${process.env.E2E_SHOT}-${mode}-off.png` });

      await page.keyboard.press('ControlOrMeta+z');
      await expect(both(page)).toBeVisible();
      if (process.env.E2E_SHOT)
        await page.screenshot({ path: `${process.env.E2E_SHOT}-${mode}-undo.png` });
      await expect(squares(page)).toHaveCount(2);

      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect(both(page)).toHaveCount(0);
      expectNoPageErrors(pageErrors);
    });

    test('undo of a delete selects what it brings back, and a click off keeps redo', async ({
      page,
      pageErrors,
    }) => {
      await selectBoth(page);
      await page.keyboard.press('Delete');
      await expect(squares(page)).toHaveCount(0);

      await page.keyboard.press('ControlOrMeta+z');
      await expect(squares(page)).toHaveCount(2);
      await expect(both(page)).toBeVisible();

      // A stray click off is a step of its own, and the delete can still be redone.
      await clickOff(page);
      await expect(both(page)).toHaveCount(0);
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await expect(squares(page)).toHaveCount(0);
      expectNoPageErrors(pageErrors);
    });
  });
}
