import type { Locator, Page } from '@playwright/test';
import { expect, expectNoPageErrors, openStartBlank, test } from './fixtures';

// Where a right-click's menu opens, and how fast (docs/specs/008-canvas/canvas-and-palette.md "Element menu anchor",
// docs/specs/004-interface-design/motion.md "Context menus"): at the pointer, a couple of pixels off its tip, and at
// once, with nothing in it still animating.

const MENU = '[data-context-menu]';
const POINTER_GAP = 2;

async function drawSquare(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('r');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Escape');
}

async function drawArrow(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('a');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
}

// The menu's top-left, and how many animations run in it the moment it is on screen.
async function openedMenu(menu: Locator): Promise<{ x: number; y: number; animations: number }> {
  await menu.waitFor();
  return menu.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, animations: el.getAnimations({ subtree: true }).length };
  });
}

test.describe('Context menu anchor', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
    await openStartBlank(page);
  });

  test('a right-click on an element opens its menu at the pointer, at once', async ({
    page,
    pageErrors,
  }) => {
    await drawSquare(page, { x: 420, y: 320 });
    const square = page.getByRole('img', { name: 'Square', exact: true });
    const box = (await square.boundingBox())!;
    const pointer = { x: box.x + box.width - 12, y: box.y + box.height - 12 };

    await page.mouse.click(pointer.x, pointer.y, { button: 'right' });

    const menu = await openedMenu(page.locator(MENU));
    expect(menu.x).toBeCloseTo(pointer.x + POINTER_GAP, 0);
    expect(menu.y).toBeCloseTo(pointer.y + POINTER_GAP, 0);
    expect(menu.animations).toBe(0);
    expectNoPageErrors(pageErrors);
  });

  test('a right-click on an arrow opens its menu at the pointer', async ({ page, pageErrors }) => {
    await drawArrow(page, { x: 300, y: 260 }, { x: 600, y: 260 });
    const pointer = { x: 450, y: 260 };

    await page.mouse.click(pointer.x, pointer.y, { button: 'right' });

    const menu = await openedMenu(page.locator(MENU));
    expect(menu.x).toBeCloseTo(pointer.x + POINTER_GAP, 0);
    expect(menu.y).toBeCloseTo(pointer.y + POINTER_GAP, 0);
    expectNoPageErrors(pageErrors);
  });

  test('the empty-canvas menu appears at once', async ({ page, pageErrors }) => {
    await page.mouse.click(700, 420, { button: 'right' });

    const menu = await openedMenu(page.locator('[data-tour-id="tab-menu"]'));
    expect(menu.animations).toBe(0);
    expectNoPageErrors(pageErrors);
  });
});
