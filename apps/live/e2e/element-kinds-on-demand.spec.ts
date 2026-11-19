import type { Page } from '@playwright/test';
import {
  enableDebugLogs,
  expect,
  expectNoPageErrors,
  openStartBlank,
  paletteTile,
  seedTab,
  test,
} from './fixtures';

// docs/specs/016-platform/web-performance.md "An element kind's code loads with the board that holds it": each kind
// family's code loads on demand, yet a board draws every element with its own face in its first frame, and a palette
// press of a family not in yet places the element once its family is. The code the page loads on demand is held back
// here (as a slow link does), so any element drawn before its family would show.

const ON_DEMAND_DELAY_MS = 1_500;

// Every script the page asks for that its HTML does not name: what it loads on demand, the families among it.
async function holdBackOnDemandCode(page: Page): Promise<void> {
  const html = await (await page.request.get('/new')).text();
  const named = new Set([...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]!));
  await page.route(
    (url) => url.pathname.includes('/_next/static/') && url.pathname.endsWith('.js'),
    async (route) => {
      if (!named.has(new URL(route.request().url()).pathname)) {
        await new Promise((resolve) => setTimeout(resolve, ON_DEMAND_DELAY_MS));
      }
      await route.continue();
    },
  );
}

// The ids of the elements on the board the first time any is, recorded before that frame paints.
async function recordFirstFrame(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __firstFrame?: string[] };
    new MutationObserver(() => {
      if (w.__firstFrame) return;
      const ids = [...document.querySelectorAll('[data-element-id]')].map((el) =>
        el.getAttribute('data-element-id')!,
      );
      if (ids.length > 0) w.__firstFrame = [...new Set(ids)].sort();
    }).observe(document, { subtree: true, childList: true });
  });
}

const box = (id: string, shape: string, x: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'shape',
  shape,
  x,
  y: 120,
  width: 180,
  height: 140,
  label: id,
  ...extra,
});

// One element of each family the face router draws from (docs/specs/016-platform/web-performance.md).
const BOARD = [
  box('plain', 'square', 40),
  box('session-controls', 'reveal', 240),
  box('collab-panels', 'estimate', 440),
  box('concepts', 'pyramid', 640),
  box('web-components', 'banner', 840),
  box('mind-maps', 'mind-node', 1040, { mindLook: 'person' }),
  { id: 'embeds', type: 'link-card', x: 40, y: 320, width: 280, height: 120 },
  box('charts', 'pie-chart', 360, { y: 320 }),
  box('sankey', 'sankey', 560, { y: 320 }),
  box('entities', 'entity', 760, {
    y: 320,
    entityFields: [{ name: 'id', type: 'uuid', key: 'pk' }],
  }),
  box('sketches', 'square', 960, { y: 320, finish: 'sketch' }),
  box('marker', 'circle', 1160, { y: 320, finish: 'marker' }),
];

test('a board draws every family’s face in its first frame', async ({ page, pageErrors }) => {
  await openStartBlank(page);
  await holdBackOnDemandCode(page);
  await recordFirstFrame(page);

  await seedTab(page, BOARD);

  const firstFrame = await page.evaluate(
    () => (window as unknown as { __firstFrame?: string[] }).__firstFrame,
  );
  expect(firstFrame).toEqual(BOARD.map((el) => el.id).sort());
  // A hand-drawn element draws its body by hand, never a plain one first.
  await expect(page.locator('[data-element-id="sketches"] [data-finish="sketch"]')).toHaveCount(1);
  await expect(page.locator('[data-element-id="marker"] [data-finish="marker"]')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});

test('a palette press places a family not yet in once it is', async ({
  page,
  context,
  pageErrors,
}) => {
  await enableDebugLogs(context);
  const waits: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().startsWith('[element-kinds] press waits')) waits.push(msg.text());
  });
  await holdBackOnDemandCode(page);
  await openStartBlank(page);

  const tile = await paletteTile(page, 'Add Pyramid', 'Concepts');
  await tile.click();
  // The press arms the tool once the family is in; a tap on the canvas places it.
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-canvas-a11y-root]').click({ position: { x: 480, y: 320 } });

  await expect(page.locator('[data-element-id]')).toHaveCount(1);
  expect(waits).toEqual(['[element-kinds] press waits family=concepts']);
  expectNoPageErrors(pageErrors);
});

// The page never idles, so no family is fetched before something needs it; and, while the test holds it, the
// browser's `online` event stops at the window, as when the connection is back before the browser has said so.
async function neverIdleAndHoldOnline(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    const w = window as unknown as { __holdOnline?: boolean };
    window.addEventListener(
      'online',
      (event) => {
        if (w.__holdOnline) event.stopImmediatePropagation();
      },
      { capture: true },
    );
  });
}

const NOTICE = 'Part of this board couldn’t load.';

// docs/specs/016-platform/web-performance.md "When a family cannot load": offline before a family was fetched, a
// press of its tile places nothing and the notice shows; Retry, once the connection is back, loads it.
test('a family that cannot load shows the notice, and Retry loads it', async ({
  page,
  context,
  pageErrors,
}) => {
  await neverIdleAndHoldOnline(page);
  await openStartBlank(page);
  const tile = await paletteTile(page, 'Add Pyramid', 'Concepts');

  await context.setOffline(true);
  await tile.click();

  const notice = page.getByText(NOTICE);
  await expect(notice).toBeVisible();
  await expect(tile).not.toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-element-id]')).toHaveCount(0);

  await page.evaluate(() => {
    (window as unknown as { __holdOnline?: boolean }).__holdOnline = true;
  });
  await context.setOffline(false);
  await expect(notice).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(notice).toBeHidden();

  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-canvas-a11y-root]').click({ position: { x: 480, y: 320 } });
  await expect(page.locator('[data-element-id]')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});

test('a family that could not load loads by itself once the connection is back', async ({
  page,
  context,
  pageErrors,
}) => {
  await neverIdleAndHoldOnline(page);
  await openStartBlank(page);
  const tile = await paletteTile(page, 'Add Pyramid', 'Concepts');

  await context.setOffline(true);
  await tile.click();
  const notice = page.getByText(NOTICE);
  await expect(notice).toBeVisible();

  await context.setOffline(false);
  await expect(notice).toBeHidden();
  await tile.click();
  await expect(tile).toHaveAttribute('aria-pressed', 'true');
  expectNoPageErrors(pageErrors);
});

// An article's writing is the pages family's whatever elements its pages hold: the open asks for the family from the
// tab's articles, so a reopened article draws its writing, with the page's on-demand code held back as on a slow link.
test('a reopened article draws its writing', async ({ page, context, pageErrors }) => {
  await enableDebugLogs(context);
  const gates: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().startsWith('[element-kinds] gate')) gates.push(msg.text());
  });
  await page.goto('/new?template=article');
  const editor = page.locator('.ProseMirror').first();
  await editor.waitFor({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/document\//);
  const firstLine = (await editor.innerText()).trim().split('\n')[0]!;
  expect(firstLine.length).toBeGreaterThan(0);

  await holdBackOnDemandCode(page);
  gates.length = 0;
  await page.reload();
  await expect(page.locator('.ProseMirror').first()).toContainText(firstLine, { timeout: 30_000 });
  expect(gates.some((line) => line.includes('pages-articles'))).toBe(true);
  expectNoPageErrors(pageErrors);
});
