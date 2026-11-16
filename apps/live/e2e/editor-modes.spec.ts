import type { Page } from '@playwright/test';
import { createInMode, expect, expectNoPageErrors, test, pageOwnerHeaders } from './fixtures';

// Editor modes end to end (docs/specs/007-editor/editor-modes.md), in dark mode: the switch beside the menu button and
// an empty tab's start always agree on Sketch, Structured or Pages, the tab menu offers none; a tab with content
// switches beside the menu button (Shift+D included) and keeps its strokes across a reload; a Plan tab offers no
// switch; the add menu's Tab opens in its maker's mode and its Board, Sheet and Dashboard open Start Planning there;
// and a switch reaches everyone at once, with Undo switching it back. Synthesised content only.

const CANVAS = '[data-canvas-a11y-root]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

// The first tab's opening mode as the api stores it.
async function savedOpensIn(page: Page): Promise<unknown> {
  const headers = await pageOwnerHeaders(page);
  return page.evaluate(
    async ({ base, headers }) => {
      const id = location.pathname.split('/').filter(Boolean).pop()!;
      const doc = (await (await fetch(`${base}/documents/${id}`, { headers })).json()) as {
        document?: { tabs?: { id: string }[] };
      };
      const tabId = doc.document?.tabs?.[0]?.id;
      if (!tabId) return undefined;
      const got = (await (
        await fetch(`${base}/documents/${id}/tabs/${tabId}`, { headers })
      ).json()) as { tab?: { opensIn?: unknown } };
      return got.tab?.opensIn;
    },
    { base: apiBase, headers },
  );
}

const dock = (page: Page) => page.locator('[data-whiteboard-dock]');
// The open tab's editor mode, as the editor marks it.
const mode = (page: Page) => page.locator('[data-editor-mode]');
// The start's own switch, and the one beside the menu button.
const startSwitch = (page: Page) => page.getByRole('button', { name: /^Tab mode: / });
const topSwitch = (page: Page) => page.getByRole('button', { name: /^Editor mode: / });
const boards = (page: Page) => page.locator('[data-plan-board]');
const sketches = (page: Page) => page.locator(CANVAS).getByRole('img', { name: /^Sketch/ });

// A new document as one of the New Document wizard's choices, on its start, in dark mode at a desktop size.
async function openInMode(page: Page, name: 'diagram' | 'draw' | 'plan') {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await createInMode(page, name);
}

async function chooseOnStart(page: Page, name: 'Sketch' | 'Structured' | 'Pages') {
  await startSwitch(page).click();
  await page.getByRole('menuitemradio', { name }).click();
}

async function chooseBesideMenu(page: Page, name: 'Sketch' | 'Structured' | 'Pages') {
  await topSwitch(page).click();
  await page.getByRole('menuitemradio', { name }).click();
}

// An empty tab offers each mode's start screen (docs/specs/007-editor/start-diagramming.md); its × starts from a
// blank canvas, as a person drawing straight away would close it.
async function closeStart(page: Page) {
  const start = page.getByRole('region', {
    name: /^Start (Diagramming|Sketching|Making Pages|a Workshop)$/,
  });
  await start.waitFor();
  await start.getByRole('button', { name: 'Close' }).click();
  await start.waitFor({ state: 'detached' });
}

async function drawWave(page: Page, from: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) {
    await page.mouse.move(from.x + i * 10, from.y + Math.sin(i / 5) * 50);
  }
  await page.mouse.up();
}

test.describe('editor modes', () => {
  // docs/specs/007-editor/editor-modes.md "The mode switch": beside the menu button and on an empty tab's start, the
  // two always agreeing; a plain menu of Sketch, Structured and Pages; none in the tab menu.
  test("the switch beside the menu button agrees with the start's, and the tab menu offers none", async ({
    page,
    pageErrors,
  }) => {
    await openInMode(page, 'diagram');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'diagram');
    await expect(startSwitch(page)).toHaveAccessibleName('Tab mode: Structured');
    await expect(topSwitch(page)).toHaveAccessibleName('Editor mode: Structured');

    await topSwitch(page).click();
    await expect(page.getByRole('menuitemradio')).toHaveText(['Sketch', 'Structured', 'Pages']);
    await expect(page.getByRole('menuitemradio', { name: 'Structured' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('menuitemradio', { name: 'Pages' }).click();
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'pages');
    await expect(startSwitch(page)).toHaveAccessibleName('Tab mode: Pages');
    await expect(topSwitch(page)).toHaveAccessibleName('Editor mode: Pages');

    await chooseOnStart(page, 'Sketch');
    await expect(topSwitch(page)).toHaveAccessibleName('Editor mode: Sketch');

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Tab menu' }).click();
    await expect(page.getByRole('button', { name: /^Mode/ })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Mode' })).toHaveCount(0);
    expectNoPageErrors(pageErrors);
  });

  test('a drawn-on tab changes mode beside the menu button and keeps its strokes', async ({
    page,
    pageErrors,
  }) => {
    await openInMode(page, 'diagram');
    await chooseOnStart(page, 'Sketch');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'draw');
    await expect(dock(page)).toBeVisible();
    await closeStart(page);

    await page.keyboard.press('1');
    await drawWave(page, { x: 500, y: 600 });
    await expect(sketches(page)).toHaveCount(1);

    // Shift+D works on a tab with content: Sketch steps to Structured.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+D');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'diagram');

    await chooseBesideMenu(page, 'Pages');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'pages');
    // Leaving Pages with something on the tab asks first (editor-modes.md "Leaving Pages").
    await chooseBesideMenu(page, 'Structured');
    await page.getByRole('button', { name: 'Switch', exact: true }).click();
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'diagram');
    await expect(sketches(page)).toHaveCount(1);

    await expect.poll(() => savedOpensIn(page), { timeout: 15_000 }).toBe('diagram');
    await page.reload();
    await page.locator(CANVAS).waitFor();
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'diagram');
    await expect(sketches(page)).toHaveCount(1);
    expectNoPageErrors(pageErrors);
  });

  test('Shift+D steps Structured, Pages, Sketch and round again', async ({ page, pageErrors }) => {
    await openInMode(page, 'diagram');
    await closeStart(page);
    await page.locator(CANVAS).click({ position: { x: 800, y: 500 } });
    await page.keyboard.press('Shift+D');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'pages');
    // The empty Pages tab opens with its start closed (docs/specs/007-editor/start-diagramming.md), so the canvas keeps
    // the keys.
    await expect(page.getByRole('region', { name: 'Start Making Pages' })).toHaveCount(0);
    await page.locator(CANVAS).click({ position: { x: 1500, y: 500 } });
    await page.keyboard.press('Shift+D');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'draw');
    expectNoPageErrors(pageErrors);
  });

  // docs/specs/026-plan/plan-tabs.md "The kinds": a Plan tab is never switched, so it shows no switch.
  test('a Plan tab offers no mode switch, and Shift+D does nothing there', async ({
    page,
    pageErrors,
  }) => {
    await openInMode(page, 'plan');
    await expect(page.getByRole('heading', { name: 'Start Planning' })).toBeVisible();
    await expect(topSwitch(page)).toHaveCount(0);
    await expect(startSwitch(page)).toHaveCount(0);
    await page.getByRole('button', { name: /^Kanban Board/ }).click();
    await expect(boards(page)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+D');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'plan');
    await expect(topSwitch(page)).toHaveCount(0);
    await expect(boards(page)).toHaveCount(1);
    expectNoPageErrors(pageErrors);
  });

  // docs/specs/007-editor/editor-modes.md "+ adds a tab or a Plan tab".
  test("the add menu's Tab opens in the mode it was made from", async ({ page, pageErrors }) => {
    await openInMode(page, 'diagram');
    await chooseOnStart(page, 'Sketch');
    await page.getByRole('button', { name: 'Add tab', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Tab', exact: true }).click();
    await expect(page.locator('[data-document-group]').getByText('Tab 2')).toBeVisible();
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'draw');
    // On its empty canvas, its mode's own start one click away (docs/specs/007-editor/start-diagramming.md).
    await expect(page.getByRole('region', { name: /^Start / })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show Templates' }).click();
    await expect(page.getByRole('region', { name: 'Start Sketching' })).toBeVisible();
    expectNoPageErrors(pageErrors);
  });

  test("the add menu's Board, Sheet and Dashboard open Start Planning there", async ({
    page,
    pageErrors,
  }) => {
    await openInMode(page, 'diagram');
    const add = async (name: string) => {
      await page.getByRole('button', { name: 'Add tab', exact: true }).click();
      await page.getByRole('menuitem', { name, exact: true }).click();
      await expect(mode(page)).toHaveAttribute('data-editor-mode', 'plan');
      await expect(page.getByRole('heading', { name: 'Start Planning' })).toBeVisible();
    };
    const rail = (name: RegExp) =>
      page.getByRole('navigation', { name: 'Categories' }).getByRole('button', { name });
    await add('Board');
    await expect(rail(/^Boards/)).toHaveAttribute('aria-current', 'true');
    await add('Sheet');
    await expect(rail(/^Spreadsheets/)).toHaveAttribute('aria-current', 'true');
    await add('Dashboard');
    await expect(rail(/^Dashboards/)).toHaveAttribute('aria-current', 'true');
    await expect(topSwitch(page)).toHaveCount(0);
    expectNoPageErrors(pageErrors);
  });

  // docs/specs/007-editor/editor-modes.md "Where the mode lives": the mode is the tab's, the same
  // for everyone on it, and a switch is one undo step.
  test("the start's switch changes the tab for everyone, and Undo switches it back", async ({
    page,
    pageErrors,
  }) => {
    await openInMode(page, 'diagram');
    // A second window on the same tab, open before the switch.
    const other = await page.context().newPage();
    await other.emulateMedia({ colorScheme: 'dark' });
    await other.setViewportSize({ width: 1600, height: 900 });
    await other.goto(page.url());
    await other.locator(CANVAS).waitFor({ timeout: 30_000 });
    await expect(mode(other)).toHaveAttribute('data-editor-mode', 'diagram');

    await chooseOnStart(page, 'Sketch');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'draw');
    await expect.poll(() => savedOpensIn(page), { timeout: 15_000 }).toBe('draw');
    // The other window follows the tab, live.
    await expect(mode(other)).toHaveAttribute('data-editor-mode', 'draw', { timeout: 15_000 });

    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(mode(page)).toHaveAttribute('data-editor-mode', 'diagram');
    await expect(mode(other)).toHaveAttribute('data-editor-mode', 'diagram', { timeout: 15_000 });
    await other.close();
    expectNoPageErrors(pageErrors);
  });
});
