import type { Page } from '@playwright/test';
import { createInMode, expect, expectNoPageErrors, test } from './fixtures';

// docs/specs/023-draw-mode/draw-mode.md "Touch and pen input": on a tablet a pen stroke always draws, a hovering pen
// never moves the view, and a palm resting while a pen is near neither pans nor draws. Fingers pan once the pen is
// gone. The browser offers no stylus to drive, so the pointer events a tablet sends are dispatched as it sends them.

test.use({ colorScheme: 'dark', viewport: { width: 1317, height: 752 }, deviceScaleFactor: 2.125 });

const PEN = 9;
const PALM = 21;

type Send = {
  type: string;
  pointerType: 'pen' | 'touch';
  pointerId: number;
  x: number;
  y: number;
  // Pressed (contact) or not (hover).
  down?: boolean;
};

async function send(page: Page, events: Send[]): Promise<void> {
  // One event a frame, as hardware sends them: a press renders the gesture it starts before the next move arrives.
  await page.evaluate(async (list) => {
    for (const e of list) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const target = document.elementFromPoint(e.x, e.y) ?? document.body;
      const pressed = e.down ?? false;
      target.dispatchEvent(
        new PointerEvent(e.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          isPrimary: e.pointerType === 'pen',
          clientX: e.x,
          clientY: e.y,
          button: e.type === 'pointerdown' || e.type === 'pointerup' ? 0 : -1,
          buttons: pressed ? 1 : 0,
          pressure: pressed ? 0.5 : 0,
          relatedTarget: null,
        }),
      );
    }
  }, events);
}

const pen = (type: string, x: number, y: number, down = false): Send => ({
  type,
  pointerType: 'pen',
  pointerId: PEN,
  x,
  y,
  down,
});
const palm = (type: string, x: number, y: number, down = true): Send => ({
  type,
  pointerType: 'touch',
  pointerId: PALM,
  x,
  y,
  down,
});

// The pen hovering in a line from (x0, y) to (x1, y), pressed or not.
const penLine = (x0: number, x1: number, y: number, down: boolean): Send[] =>
  Array.from({ length: 8 }, (_, i) => pen('pointermove', x0 + ((x1 - x0) * (i + 1)) / 8, y, down));

const view = (page: Page) =>
  page
    .locator('[data-canvas-content]')
    .first()
    .evaluate((el) => (el as HTMLElement).style.transform);
const elementCount = (page: Page) => page.locator('[data-element-id]').count();

async function openSketchWithPen(page: Page): Promise<void> {
  await createInMode(page, 'draw');
  const start = page.getByRole('region', { name: 'Start Sketching' });
  await start.getByRole('button', { name: 'Close' }).click();
  await start.waitFor({ state: 'detached' });
  // The first marker in hand.
  await page.keyboard.press('1');
}

test.describe('Pen and palm on a tablet', () => {
  test('a hovering pen never moves the view, and its stroke draws beside a resting palm', async ({
    page,
    pageErrors,
  }) => {
    await openSketchWithPen(page);
    // The pen has drawn before (a dot), so a finger on its own would pan.
    await send(page, [
      pen('pointerover', 300, 200),
      pen('pointerdown', 300, 200, true),
      pen('pointerup', 300, 200),
    ]);
    const before = await view(page);
    const count = await elementCount(page);

    // The pen arrives and hovers across the board: nothing moves.
    await send(page, [pen('pointerover', 400, 300), ...penLine(400, 900, 300, false)]);
    expect(await view(page)).toBe(before);

    // A palm comes to rest while the pen hovers, then the pen draws a stroke and the palm shifts a little.
    await send(page, [
      palm('pointerdown', 1000, 600),
      pen('pointerdown', 500, 400, true),
      ...penLine(500, 800, 400, true),
      palm('pointermove', 1010, 640),
      pen('pointerup', 800, 400),
      palm('pointerup', 1010, 640, false),
    ]);

    await expect.poll(() => elementCount(page)).toBe(count + 1);
    expect(await view(page)).toBe(before);
    expectNoPageErrors(pageErrors);
  });

  test('a palm that landed first never pans with the pen hovering above it', async ({
    page,
    pageErrors,
  }) => {
    await openSketchWithPen(page);
    // A pen used once, then gone: a finger pans from here on.
    await send(page, [
      pen('pointerover', 400, 300),
      pen('pointerdown', 400, 300, true),
      pen('pointerup', 400, 300),
      // Out with nowhere to go (no related target): the pen left range.
      pen('pointerout', 400, 300),
    ]);
    const before = await view(page);

    await send(page, [
      palm('pointerdown', 1000, 600),
      pen('pointerover', 500, 300),
      ...penLine(500, 900, 300, false),
      palm('pointerup', 1000, 600, false),
    ]);

    expect(await view(page)).toBe(before);
    expectNoPageErrors(pageErrors);
  });

  test('a finger still pans once the pen has left range', async ({ page, pageErrors }) => {
    await openSketchWithPen(page);
    await send(page, [
      pen('pointerover', 400, 300),
      pen('pointerdown', 400, 300, true),
      pen('pointerup', 400, 300),
      // Out with nowhere to go (no related target): the pen left range.
      pen('pointerout', 400, 300),
    ]);
    const before = await view(page);

    await send(page, [
      palm('pointerdown', 700, 400),
      palm('pointermove', 760, 440),
      palm('pointermove', 820, 480),
      palm('pointerup', 820, 480, false),
    ]);

    await expect.poll(() => view(page)).not.toBe(before);
    expectNoPageErrors(pageErrors);
  });
});
