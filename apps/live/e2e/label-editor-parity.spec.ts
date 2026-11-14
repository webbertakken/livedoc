import type { Locator, Page } from '@playwright/test';
import { expect, expectNoPageErrors, seedTab, test } from './fixtures';

// docs/specs/008-canvas/canvas-and-palette.md "Text alignment": the label editor draws the text exactly as the
// label does, at every zoom, so opening it moves no word; docs/specs/004-interface-design/fonts.md "Text size":
// Scale on a single-line label is a middling fixed px, never stretched to its box; and
// docs/specs/023-draw-mode/draw-mode.md "Selecting": a double-click on a label's words opens that element's label.
// On a whiteboard, in dark mode. Synthesised content only.

const SHOTS = process.env.E2E_SHOTS_DIR;

test.use({ viewport: { width: 1400, height: 900 }, colorScheme: 'dark' });

const loop = [
  { nx: 0, ny: 0 },
  { nx: 0.5, ny: 0.03 },
  { nx: 1, ny: 0 },
  { nx: 0.97, ny: 0.5 },
  { nx: 1, ny: 1 },
  { nx: 0.5, ny: 0.97 },
  { nx: 0, ny: 1 },
  { nx: 0.03, ny: 0.5 },
  { nx: 0, ny: 0.01 },
];

// A square at Scale (no size stored), one at a stored px, a pen loop with a label, and a fixed text box.
const BOARD = [
  {
    id: 'scale',
    type: 'shape',
    shape: 'square',
    x: 120,
    y: 120,
    width: 240,
    height: 240,
    label: 'Image',
  },
  {
    id: 'px',
    type: 'shape',
    shape: 'ellipse',
    x: 440,
    y: 120,
    width: 260,
    height: 160,
    label: 'A label long enough to wrap onto lines',
    textSize: 22,
  },
  {
    id: 'loop',
    type: 'freehand',
    x: 780,
    y: 120,
    width: 240,
    height: 240,
    label: 'Image',
    points: loop,
    closed: false,
    penWidth: 2.5,
    streamline: 0.2,
  },
  {
    id: 'text',
    type: 'text',
    x: 440,
    y: 360,
    width: 260,
    height: 60,
    label: 'Plain words',
    textSize: 'md',
  },
];

type Typeset = { left: number; top: number; width: number; height: number; font: string };

// The drawn words' box on screen (their line boxes, through a range) and their type, read off the label.
async function typeset(node: Locator): Promise<Typeset> {
  return node.evaluate((host) => {
    const range = document.createRange();
    range.selectNodeContents(host);
    const r = range.getBoundingClientRect();
    const text = host.querySelector('[data-label-words]') ?? host.firstElementChild ?? host;
    const s = getComputedStyle(text as Element);
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      font: [s.fontSize, s.lineHeight, s.fontFamily, s.fontWeight, s.fontStyle].join(' / '),
    };
  });
}

async function openBoard(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/new?template=whiteboard');
  await page.locator('[data-canvas-a11y-root]').waitFor({ timeout: 30_000 });
  await seedTab(page, BOARD);
  await page.keyboard.press('v');
  await expect(page.locator('[data-label-words]')).toHaveCount(4);
}

const element = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();

async function expectEditorOnTheWords(page: Page, id: string) {
  const words = element(page, id).locator('[data-label-words]').first();
  const drawn = await typeset(words.locator('xpath=..'));
  const box = (await words.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const editor = element(page, id).locator('[contenteditable="true"]');
  await expect(editor, id).toBeVisible();
  const editing = await typeset(editor);
  expect(editing.font, id).toBe(drawn.font);
  for (const side of ['left', 'top', 'width', 'height'] as const) {
    expect(Math.abs(editing[side] - drawn[side]), `${id} ${side}`).toBeLessThanOrEqual(1);
  }
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await page.mouse.click(1300, 820);
}

test.describe('a label and its editor', () => {
  test('Scale draws a single-line label at a fixed size, not stretched to its box', async ({
    page,
    pageErrors,
  }) => {
    await openBoard(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card31-board.png` });
    const size = await element(page, 'scale')
      .locator('[data-label-words]')
      .evaluate((n) => getComputedStyle(n).fontSize);
    expect(size).toBe('16px');
    expectNoPageErrors(pageErrors);
  });

  test('a double-click on a stroke\u2019s words opens its label, not a new text box', async ({
    page,
    pageErrors,
  }) => {
    await openBoard(page);
    const words = (await element(page, 'loop').locator('[data-label-words]').boundingBox())!;
    await page.mouse.dblclick(words.x + words.width / 2, words.y + words.height / 2);
    await expect(element(page, 'loop').locator('[contenteditable="true"]')).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/card31-editing.png` });
    await expect(page.locator('[data-element-id]')).toHaveCount(4);
    expectNoPageErrors(pageErrors);
  });

  for (const zoom of [1, 2]) {
    test(`the editor opens on the words exactly where they are drawn, at ${zoom * 100}%`, async ({
      page,
      pageErrors,
    }) => {
      await openBoard(page);
      for (let z = 1; z < zoom; z *= 2) await page.keyboard.press('ControlOrMeta+=');
      for (const id of ['scale', 'px', 'loop', 'text']) await expectEditorOnTheWords(page, id);
      expectNoPageErrors(pageErrors);
    });
  }
});
