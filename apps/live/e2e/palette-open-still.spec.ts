import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, test } from './fixtures';

// docs/specs/007-editor/toolbar-layout.md "Motion": the strip's first paint is its settled layout. As a board opens,
// the top line fills in (the Start Tour button joins the actions group) and the strip refits to it, dropping tiles
// and bringing in More; every refit settles before the frame is drawn, so the strip and the tray hanging from it
// never move. Chrome's layout-shift entries are the measure: what only a browser can show. Dark mode.

type Shift = { value: number; moved: string[] };

// Every layout shift from before the app loads, with what moved, kept where the test can read it.
async function recordShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: Shift[] = [];
    (window as unknown as { __shifts: Shift[] }).__shifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        sources: { node: Node | null }[];
      })[]) {
        const moved = entry.sources.map((s) => {
          const el = s.node instanceof Element ? s.node : null;
          if (!el) return 'text';
          const inStrip = el.closest('[data-toolbar-palette]');
          const tray = el.closest('[data-palette-tray]') ?? el.querySelector('[data-palette-tray]');
          return inStrip ? 'strip' : tray ? 'tray' : el.tagName.toLowerCase();
        });
        shifts.push({ value: entry.value, moved });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

// Its own row at 1280 until the tour button drops its tiles to fit; at 1440 dropping one brings in More, which widened
// the strip past the room and needed a second refit.
const chromeShifts = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __shifts: Shift[] }).__shifts.filter((s) =>
      s.moved.some((m) => m === 'strip' || m === 'tray'),
    ),
  );
const twoFrames = (page: Page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

// An article's formatting docks into the strip with the article's editor, a chunk of its own: the strip holds its
// place from the first frame, so it neither grows nor takes a row of its own when the controls arrive.
test('an article opens with its strip already as wide as its docked formatting', async ({
  page,
  pageErrors,
}) => {
  await recordShifts(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/new?template=blank-article');
  await expect(page.locator('[data-article-dock] [data-page-toolbar]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-article-dock-reserve]')).toHaveCount(0);
  await twoFrames(page);
  expect(await chromeShifts(page)).toEqual([]);
  expectNoPageErrors(pageErrors);
});

for (const width of [1280, 1440]) {
  test(`a board opens with the strip and its tray where they stay (${width})`, async ({
    page,
    pageErrors,
  }) => {
    await recordShifts(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/new?template=blank');
    await page.locator('[data-canvas-a11y-root]').waitFor({ timeout: 30_000 });
    // The last of the top line to arrive, as a guest's blank diagram offers its tour.
    await expect(page.locator('[data-toolbar-actions] [data-tour-offer]')).toBeVisible();
    await expect(page.locator('[data-palette-tray]')).toBeVisible();
    // Two frames past it, so any refit it set off has been drawn.
    await twoFrames(page);
    expect(await chromeShifts(page)).toEqual([]);
    expectNoPageErrors(pageErrors);
  });
}
