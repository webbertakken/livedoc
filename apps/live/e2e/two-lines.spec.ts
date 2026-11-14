import type { Locator, Page } from '@playwright/test';
import { EXPLORER_LANDING_PATH } from '../lib/explorer-landing';
import { expect, expectNoPageErrors, openStartBlank, switchToTab, test } from './fixtures';

// The editor's two lines (docs/specs/007-editor/toolbar-layout.md "The two lines"): no header bar and no tab bar, the
// chrome in toolbar groups over the canvas, in a real browser, dark mode.
test.use({ colorScheme: 'dark' });

const brand = (page: Page) => page.locator('[data-toolbar-menu]');
const actions = (page: Page) => page.locator('[data-toolbar-actions]');
const tools = (page: Page) => page.locator('[data-zoom-cluster]');
const documentGroup = (page: Page) => page.locator('[data-document-group]');
const strip = (page: Page) => page.locator('[data-tour-id="palette"]');

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not drawn');
  return b;
}

test.describe('the two lines', () => {
  test('lays the groups out on two lines, with no header or tab bar', async ({
    page,
    pageErrors,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStartBlank(page);
    await expect(page.locator('header')).toHaveCount(0);
    await expect(page.locator('[data-editor-tabbar]')).toHaveCount(0);

    const view = page.viewportSize()!;
    const b = await box(brand(page));
    const a = await box(actions(page));
    // The strip settles once it has measured its room (useStripTileLimit): it sheds tiles to fit between the groups.
    await expect
      .poll(async () => {
        const at = await box(strip(page));
        return at.x > b.x + b.width && at.x + at.width < a.x;
      })
      .toBe(true);
    const s = await box(strip(page));
    const t = await box(tools(page));
    const d = await box(documentGroup(page));
    // Top line: brand left, actions right, the strip between them, clear of both.
    expect(b.x).toBeLessThanOrEqual(16);
    expect(b.y).toBeLessThanOrEqual(16);
    expect(view.width - (a.x + a.width)).toBeLessThanOrEqual(16);
    expect(s.x).toBeGreaterThan(b.x + b.width);
    expect(s.x + s.width).toBeLessThan(a.x);
    // Bottom line: tools left, the document group right, on one row.
    expect(t.x).toBeLessThanOrEqual(16);
    expect(view.height - (t.y + t.height)).toBeLessThanOrEqual(16);
    expect(view.width - (d.x + d.width)).toBeLessThanOrEqual(16);
    expect(Math.abs(t.y + t.height - (d.y + d.height))).toBeLessThan(2);
    // One height for every group (46px at the toolbar's own scale, the same on each line).
    expect(Math.round(b.height)).toBe(Math.round(a.height));
    expectNoPageErrors(pageErrors);
  });

  // docs/specs/007-editor/toolbar-layout.md "When a line runs out of room": centred while it fits centred, then off
  // centre between the groups, then fewer tiles, all on the line; its own row only after.
  test('keeps the strip on the top line at 1024, off centre between the groups', async ({
    page,
    pageErrors,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openStartBlank(page);
    const b = await box(brand(page));
    const a = await box(actions(page));
    await expect.poll(async () => Math.round((await box(strip(page))).y)).toBe(Math.round(b.y));
    const s = await box(strip(page));
    expect(s.x).toBeGreaterThanOrEqual(b.x + b.width + 7);
    expect(s.x + s.width).toBeLessThanOrEqual(a.x - 7);
    await page.screenshot({ path: 'test-results/two-lines-1024.png' });
    expectNoPageErrors(pageErrors);
  });

  test('Back goes to the Explorer, caret and mark, no wordmark', async ({ page, pageErrors }) => {
    await openStartBlank(page);
    const back = brand(page).getByRole('link', { name: 'Back to the Explorer' });
    await expect(back).toHaveAttribute('href', EXPLORER_LANDING_PATH);
    await expect(back.locator('[data-back-caret]')).toBeVisible();
    await expect(back.locator('[data-logotype]')).toHaveCount(0);
    expectNoPageErrors(pageErrors);
  });

  test('parts a group by a 1px divider, never a nested box', async ({ page, pageErrors }) => {
    await openStartBlank(page);
    const parts = actions(page).locator('[data-toolbar-part]');
    const second = parts.nth(1);
    const rule = await second.evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      return { width: before.width, height: before.height, colour: before.backgroundColor };
    });
    // At the toolbar's UI scale the rule rounds to a hair under or over: 1px and 24px.
    expect(parseFloat(rule.width)).toBeCloseTo(1, 0);
    expect(parseFloat(rule.height)).toBeCloseTo(24, 0);
    // The first part opens with no divider.
    const first = await parts.first().evaluate((el) => getComputedStyle(el, '::before').content);
    expect(first === 'none' || first === 'normal').toBe(true);
    expectNoPageErrors(pageErrors);
  });

  test('opens the same tab list from the tab stack, and switches with the keyboard', async ({
    page,
    pageErrors,
  }) => {
    await openStartBlank(page);
    const add = documentGroup(page).getByRole('button', { name: 'Add tab' });
    // + opens the add menu (docs/specs/007-editor/editor-modes.md "+ adds a tab or a Plan tab"); its Tab adds one.
    for (let i = 0; i < 2; i += 1) {
      await add.click();
      await page.getByRole('menuitem', { name: 'Tab', exact: true }).click();
    }
    const stack = documentGroup(page).locator('[data-tab-stack]');
    await expect(stack).toHaveAccessibleName('Tab 3, all tabs (3)');
    await stack.click();
    const list = page.getByRole('dialog', { name: 'Tabs' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('button', { name: 'Tab 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // It hangs above the stack.
    expect((await box(list)).y + (await box(list)).height).toBeLessThan((await box(stack)).y);
    await page.keyboard.press('Home');
    await expect(list.getByRole('button', { name: 'Tab 1' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(list).toHaveCount(0);
    await expect(
      documentGroup(page).locator('[data-tour-id="active-tab"]').getByText('Tab 1'),
    ).toBeVisible();
    // Escape closes it and hands the focus back to the stack.
    await stack.click();
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(stack).toBeFocused();
    await switchToTab(page, 'Tab 2');
    await page.screenshot({ path: 'test-results/two-lines-desktop.png' });
    expectNoPageErrors(pageErrors);
  });

  test('on a phone, wraps the bottom line and leaves the name out', async ({
    page,
    pageErrors,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStartBlank(page);
    const t = await box(tools(page));
    const d = await box(documentGroup(page));
    expect(d.y + d.height).toBeLessThanOrEqual(t.y);
    await expect(documentGroup(page).locator('[data-doc-name]')).toBeHidden();
    // The top line keeps both side groups on its row, the strip on a row of its own under it.
    const b = await box(brand(page));
    const a = await box(actions(page));
    const s = await box(strip(page));
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    expect(a.x).toBeGreaterThanOrEqual(b.x + b.width);
    expect(s.y).toBeGreaterThanOrEqual(b.y + b.height);
    await page.screenshot({ path: 'test-results/two-lines-phone.png' });
    expectNoPageErrors(pageErrors);
  });
});
