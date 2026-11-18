import type { Locator, Page } from '@playwright/test';
import { defaultCatalogue, presetSetup } from '@livedoc/items';
import {
  expect,
  expectNoPageErrors,
  guestSigFor,
  mintSignedGuest,
  ownerHeaders,
  test,
} from './fixtures';

// A Board tab's board respects the chrome (docs/specs/026-plan/plan-board.md "Maximised board", "It respects the
// chrome"): it sits in the content frame the top line, the bottom line and the panels leave, overlapping none of them;
// the chrome keeps its own cards; the board keeps its title in its header and the active tab keeps the tab's name.

test.use({ launchOptions: { args: ['--mute-audio'] } });

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
const CANVAS = '[data-canvas-a11y-root]';

async function openBoardTab(page: Page, baseURL: string) {
  const owner = await mintSignedGuest(page.request);
  const id = crypto.randomUUID();
  const headers = ownerHeaders(owner, { Origin: new URL(baseURL).origin });
  const seeded = await page.request.post(`${apiBase}/documents`, {
    headers,
    data: {
      id,
      name: 'Tracker',
      itemTypes: defaultCatalogue(),
      tabs: [
        {
          id: crypto.randomUUID(),
          name: 'Reports',
          kind: 'board',
          opensIn: 'plan',
          elements: [
            {
              id: 'board',
              type: 'shape',
              shape: 'plan-board',
              x: 100,
              y: 100,
              width: 1100,
              height: 560,
              planBoard: presetSetup('kanban'),
            },
          ],
        },
      ],
    },
  });
  expect(seeded.ok()).toBe(true);
  await page.addInitScript(
    ({ o, sig }) => {
      localStorage.setItem('livedoc:v2:self-id', o);
      if (sig) localStorage.setItem('livedoc:v2:self-sig', sig);
      localStorage.setItem('livedoc:v2:name-confirmed', '1');
    },
    { o: owner, sig: guestSigFor(owner) },
  );
  await page.goto(`/document/${id}`);
  await page.locator(CANVAS).waitFor();
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function boxesOf(locator: Locator): Promise<Box[]> {
  const out: Box[] = [];
  for (const el of await locator.all()) {
    const b = await el.boundingBox();
    if (b && b.width > 0 && b.height > 0) out.push(b);
  }
  return out;
}

const SIZES = [
  ['desktop', { width: 1440, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const;

for (const scheme of ['dark', 'light'] as const) {
  for (const [label, viewport] of SIZES) {
    test(`a Board tab's board sits clear of the chrome, which keeps its look (${label}, ${scheme})`, async ({
      page,
      baseURL,
      pageErrors,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize(viewport);
      await openBoardTab(page, baseURL!);
      const frame = page.locator('[data-fill-tab-board]');
      await expect(frame.locator('[data-board-header]')).toBeVisible();

      // The chrome: the top line's groups, the palette strip's card, and the bottom line's groups.
      const chrome = [
        ...(await boxesOf(page.locator('[data-toolbar-menu], [data-toolbar-actions]'))),
        ...(await boxesOf(page.locator('[data-toolbar-palette]:not(.hidden) > *'))),
        ...(await boxesOf(page.locator('[data-bottom-line] > *, [data-document-group]'))),
      ];
      expect(chrome.length).toBeGreaterThan(2);
      await expect
        .poll(async () => {
          const board = (await frame.boundingBox())!;
          return chrome.filter((c) => overlaps(board, c)).length;
        })
        .toBe(0);

      // The board keeps its own title; the active tab keeps the tab's name.
      await expect(frame.locator('[data-board-title]')).toHaveText('Kanban');
      await expect(page.locator('[data-active-tab-segment]')).toContainText('Reports');
      await expect(page.locator('[data-active-tab-segment]')).not.toContainText('Kanban');

      // The brand group keeps its own card.
      const brandFill = await page
        .locator('[data-toolbar-menu]')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(brandFill).not.toBe('rgba(0, 0, 0, 0)');

      await page.screenshot({
        path: test.info().outputPath(`board-tab-${label}-${scheme}.png`),
        animations: 'disabled',
      });
      expectNoPageErrors(pageErrors);
    });
  }
}
