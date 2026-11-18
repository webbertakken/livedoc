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

// One element of each family the face router draws from (docs/specs/016-platform/blueprints/element-kinds-on-demand.md).
const BOARD = [
  box('plain', 'square', 40),
  box('session-controls', 'reveal', 240),
  box('collab-panels', 'estimate', 440),
  box('concepts', 'pyramid', 640),
  box('web-components', 'banner', 840),
  box('mind-maps', 'mind-node', 1040, { mindLook: 'person' }),
  { id: 'embeds', type: 'link-card', x: 40, y: 320, width: 280, height: 120 },
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

  await expect(page.locator('[data-element-id]')).toHaveCount(1);
  expect(waits).toEqual(['[element-kinds] press waits family=concepts']);
  expectNoPageErrors(pageErrors);
});
