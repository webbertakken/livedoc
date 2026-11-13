import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, seedTab, test } from './fixtures';

// Turning and flipping a selection on a whiteboard (docs/specs/008-canvas/selection-transforms.md), in dark mode: the
// multi-selection's Rotation tiles turn it as one piece, a rotate zone just outside a corner turns it by hand while the
// corner handle itself still resizes, and Shift+H / the menu's Flip buttons mirror it with its text left readable.
// Synthesised content only.

const SHOTS = process.env.E2E_SHOTS_DIR;

test.use({ viewport: { width: 1600, height: 1000 }, colorScheme: 'dark' });

const wave = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ nx: i / (n - 1), ny: (Math.sin(i / 1.5) + 1) / 2 }));

// An L of two boxes with a stroke and a label: lopsided, so a turn of each element in place reads differently
// from a turn of the whole.
const BOARD = [
  {
    id: 'tall',
    type: 'shape',
    shape: 'square',
    x: 500,
    y: 300,
    width: 120,
    height: 260,
    penColour: 'blue',
  },
  {
    id: 'wide',
    type: 'shape',
    shape: 'square',
    x: 620,
    y: 440,
    width: 280,
    height: 120,
    penColour: 'green',
  },
  {
    id: 'ink',
    type: 'freehand',
    x: 640,
    y: 320,
    width: 240,
    height: 80,
    points: wave(16),
    closed: false,
    penWidth: 2.5,
    streamline: 0.2,
  },
  {
    id: 'label',
    type: 'text',
    x: 640,
    y: 470,
    width: 200,
    height: 40,
    label: 'Sketch',
    textSize: 'lg',
  },
];

type Placed = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

async function openBoard(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/new?template=whiteboard');
  await page.locator('[data-canvas-a11y-root]').waitFor({ timeout: 30_000 });
  await seedTab(page, BOARD);
  await page.keyboard.press('v');
}

// Every element's placement as the canvas draws it right now (the element's own box and its turn).
async function placed(page: Page): Promise<Record<string, Placed>> {
  const out: Record<string, Placed> = {};
  for (const { id } of BOARD) {
    const el = page.locator(`[data-element-id="${id}"]`).first();
    const style = await el.evaluate((node) => {
      const host = node as HTMLElement;
      return {
        left: parseFloat(host.style.left),
        top: parseFloat(host.style.top),
        width: parseFloat(host.style.width),
        height: parseFloat(host.style.height),
        transform: host.style.transform,
      };
    });
    const turn = /rotate\((-?[\d.]+)deg\)/.exec(style.transform);
    out[id] = {
      id,
      x: style.left,
      y: style.top,
      width: style.width,
      height: style.height,
      rotation: turn ? Number(turn[1]) : 0,
    };
  }
  return out;
}

const centre = (p: Placed) => ({ x: p.x + p.width / 2, y: p.y + p.height / 2 });
const distance = (a: Placed, b: Placed) =>
  Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y);

async function selectAll(page: Page) {
  await page.mouse.click(1300, 850);
  await page.keyboard.press('ControlOrMeta+a');
  await expect(page.locator('[data-rotate-zone]')).toHaveCount(4);
}

test.describe('selection transforms on a whiteboard', () => {
  test('the Rotation tiles turn a multi-selection as one piece', async ({ page, pageErrors }) => {
    await openBoard(page);
    const before = await placed(page);
    await selectAll(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card21-before.png` });

    await page
      .locator('[data-element-id="tall"]')
      .first()
      .click({ button: 'right', position: { x: 60, y: 60 } });
    await page.getByRole('button', { name: 'Rotation', exact: true }).click();
    await page.getByRole('button', { name: '90°', exact: true }).click();
    await page.keyboard.press('Escape');
    const after = await placed(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card21-after.png` });

    for (const { id } of BOARD) expect(after[id]!.rotation, id).toBe(90);
    // Rigid: every pair of members keeps its distance, and the L has swung round (its tall box no longer the left one).
    expect(distance(after.tall!, after.wide!)).toBeCloseTo(distance(before.tall!, before.wide!), 0);
    expect(distance(after.ink!, after.label!)).toBeCloseTo(distance(before.ink!, before.label!), 0);
    expect(centre(after.tall!).y).toBeLessThan(centre(after.wide!).y - 50);
    expectNoPageErrors(pageErrors);
  });

  test('a zone outside a corner turns the selection; the handle still resizes', async ({
    page,
    pageErrors,
  }) => {
    await openBoard(page);
    const before = await placed(page);
    await selectAll(page);

    const zone = page.locator('[data-rotate-zone="ne"]');
    const z = (await zone.boundingBox())!;
    await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2);
    expect(await zone.evaluate((node) => getComputedStyle(node).cursor)).toContain(
      'data:image/svg+xml',
    );
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card20-hover.png` });

    // Sweep a quarter turn clockwise about the frame's centre.
    const frame = (await page.locator('[data-turn-frame]').first().boundingBox())!;
    const pivot = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
    const start = { x: z.x + z.width / 2, y: z.y + z.height / 2 };
    const r = Math.hypot(start.x - pivot.x, start.y - pivot.y);
    const a0 = Math.atan2(start.y - pivot.y, start.x - pivot.x);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      const a = a0 + (i / 12) * (Math.PI / 4);
      await page.mouse.move(pivot.x + r * Math.cos(a), pivot.y + r * Math.sin(a));
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card20-turning.png` });
    await page.mouse.up();
    const after = await placed(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card20-after.png` });
    for (const { id } of BOARD) expect(after[id]!.rotation, id).toBe(45);
    expect(distance(after.tall!, after.wide!)).toBeCloseTo(distance(before.tall!, before.wide!), 0);

    // One undo puts the whole turn back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await placed(page)).wide!.rotation).toBe(0);

    // The corner handle of a lone element still resizes.
    await page.mouse.click(1300, 850);
    await page
      .locator('[data-element-id="wide"]')
      .first()
      .click({ position: { x: 20, y: 20 } });
    const handle = page.locator('[data-grips-for="wide"] [data-canvas-handle]').nth(3);
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + 60, h.y + 40, { steps: 6 });
    await page.mouse.up();
    const resized = (await placed(page)).wide!;
    expect(resized.width).toBeGreaterThan(before.wide!.width + 30);
    expect(resized.rotation).toBe(0);
    expectNoPageErrors(pageErrors);
  });

  test('Shift+H and the menu flip the selection, text kept readable', async ({
    page,
    pageErrors,
  }) => {
    await openBoard(page);
    const before = await placed(page);
    await selectAll(page);

    await page.keyboard.press('Shift+H');
    const flipped = await placed(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card18-flip-horizontal.png` });
    // Mirrored left to right: the tall box goes from the left of the wide one to its right.
    expect(centre(flipped.tall!).x).toBeGreaterThan(centre(flipped.wide!).x);
    expect(flipped.tall!.y).toBeCloseTo(before.tall!.y, 0);
    // The label moves but never mirrors its words.
    const labelTransform = await page
      .locator('[data-element-id="label"]')
      .first()
      .evaluate((node) => (node as HTMLElement).style.transform);
    expect(labelTransform).not.toContain('scale(-1');

    await page
      .locator('[data-element-id="tall"]')
      .first()
      .click({ button: 'right', position: { x: 60, y: 60 } });
    await page.getByRole('button', { name: 'Rotation', exact: true }).click();
    const flipVertical = page.getByRole('button', { name: 'Flip Vertical', exact: true });
    await expect(page.getByRole('button', { name: '90°', exact: true })).toBeVisible();
    await flipVertical.click();
    // The menu stays open after a flip, its section settled.
    await expect(flipVertical).toBeVisible();
    if (SHOTS) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/card18-flip-menu.png` });
    }
    await page.keyboard.press('Escape');
    const both = await placed(page);
    expect(centre(both.tall!).y).toBeGreaterThan(centre(both.wide!).y - 5);

    // Flipping each way again restores the board.
    await page.keyboard.press('Shift+V');
    await page.keyboard.press('Shift+H');
    const back = await placed(page);
    for (const { id } of BOARD) {
      expect(back[id]!.x, id).toBeCloseTo(before[id]!.x, 0);
      expect(back[id]!.y, id).toBeCloseTo(before[id]!.y, 0);
    }
    expectNoPageErrors(pageErrors);
  });
});
