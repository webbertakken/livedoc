import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, seedTab, startBlankDocument, test } from './fixtures';

// A named actor's connectors meet it under its name, never inside it
// (docs/specs/008-canvas/arrow-anchors.md "The actor's name"): unit tests prove the outline; only
// the editor proves the canvas draws the lines clear of the name.

const ACTOR = { x: 400, y: 100, width: 90, height: 130 };
const box = (id: string, label: string, x: number) => ({
  id,
  type: 'shape',
  shape: 'square',
  x,
  y: 400,
  width: 120,
  height: 60,
  label,
});
const pinned = (elementId: string, anchor: string) => ({ kind: 'pinned', elementId, anchor });
const arrow = (id: string, anchor: string, to: string) => ({
  id,
  type: 'arrow',
  from: pinned('actor', anchor),
  to: pinned(to, 'n'),
});

// The drawn path's first point, in canvas coordinates, off the hit band.
async function pathStart(page: Page, arrowId: string): Promise<{ x: number; y: number }> {
  const d = await page.locator(`path[data-element-id="${arrowId}"]`).getAttribute('d');
  const nums = (d ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number);
  return { x: nums[0]!, y: nums[1]! };
}

test.use({ colorScheme: 'dark' });

test.describe('Actor name stays above its connectors', () => {
  test('starts every line from under the name', async ({ page, pageErrors }) => {
    await startBlankDocument(page);
    await seedTab(page, [
      {
        id: 'actor',
        type: 'shape',
        shape: 'actor',
        ...ACTOR,
        label: 'Customer',
        textAlignY: 'bottom',
      },
      box('left', 'Web', 200),
      box('mid', 'App', 385),
      box('right', 'Kiosk', 570),
      arrow('a-left', 'sw', 'left'),
      arrow('a-mid', 's', 'mid'),
      arrow('a-right', 'se', 'right'),
    ]);

    // Opt-in evidence for a pull request: the actor and its three lines, cropped.
    if (process.env.E2E_SHOT) {
      const actor = (await page.locator('[data-element-id="actor"]').first().boundingBox())!;
      const pad = actor.width * 2.4;
      await page.screenshot({
        path: process.env.E2E_SHOT,
        clip: {
          x: actor.x - pad,
          y: actor.y - 20,
          width: actor.width + 2 * pad,
          height: actor.height * 2.6,
        },
      });
    }

    const bottom = ACTOR.y + ACTOR.height;
    expect(await pathStart(page, 'a-mid')).toEqual({ x: ACTOR.x + ACTOR.width / 2, y: bottom });
    expect(await pathStart(page, 'a-left')).toEqual({ x: ACTOR.x, y: bottom });
    expect(await pathStart(page, 'a-right')).toEqual({ x: ACTOR.x + ACTOR.width, y: bottom });

    expectNoPageErrors(pageErrors);
  });
});
