import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, seedTab, test } from './fixtures';

// docs/specs/008-canvas/canvas-performance.md "The contexts around the element layer hold still": no context
// provided above an element view changes its value through a select, a drag, a deselect, a marquee, a pencil stroke
// and an undo. A changed one makes React check every element view under it for readers. Read from React's own
// commits through the developer-tools hook, which React calls on every commit. Dark mode; synthesised board.

const CANVAS = '[data-canvas-a11y-root]';

const BOARD = [
  { id: 'a', type: 'shape', shape: 'square', x: 300, y: 300, width: 120, height: 80 },
  { id: 'b', type: 'shape', shape: 'square', x: 700, y: 300, width: 120, height: 80 },
  {
    id: 'ab',
    type: 'arrow',
    from: { kind: 'pinned', elementId: 'a', anchor: 'e' },
    to: { kind: 'pinned', elementId: 'b', anchor: 'w' },
  },
];

// Installed before React loads: on each commit while recording, every context provider whose value changed and
// that holds an element view, named by its value's keys.
function recordChangedContexts() {
  type Fiber = {
    tag: number;
    child: Fiber | null;
    sibling: Fiber | null;
    alternate: Fiber | null;
    memoizedProps: Record<string, unknown> | null;
  };
  const PROVIDER = 10;
  const HOST = 5;
  const w = window as unknown as {
    __changedContexts: string[];
    __recording: boolean;
    __step: string;
  };
  w.__changedContexts = [];
  w.__recording = false;
  w.__step = '';
  const holdsElementView = (provider: Fiber) => {
    const stack: (Fiber | null)[] = [provider.child];
    while (stack.length) {
      const f = stack.pop();
      if (!f) continue;
      if (f.tag === HOST && f.memoizedProps?.['data-element-id'] !== undefined) return true;
      stack.push(f.child, f.sibling);
    }
    return false;
  };
  // The value by its first keys, and which of its keys changed.
  const describe = (was: unknown, now: unknown) => {
    if (!was || !now || typeof was !== 'object' || typeof now !== 'object') return String(now);
    const before = was as Record<string, unknown>;
    const after = now as Record<string, unknown>;
    const keys = Object.keys(after);
    const changed = keys.filter((k) => before[k] !== after[k]);
    const more = changed.length > 8 ? ` and ${changed.length - 8} more` : '';
    return `{${keys.slice(0, 6).join(', ')}} changed ${changed.slice(0, 8).join(', ')}${more}`;
  };
  (window as unknown as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject: () => 1,
    checkDCE: () => {},
    onScheduleFiberRoot: () => {},
    onCommitFiberUnmount: () => {},
    onPostCommitFiberRoot: () => {},
    onCommitFiberRoot: (_id: unknown, root: { current: Fiber }) => {
      if (!w.__recording) return;
      const stack: (Fiber | null)[] = [root.current];
      while (stack.length) {
        const f = stack.pop();
        if (!f) continue;
        const before = f.alternate?.memoizedProps;
        if (
          f.tag === PROVIDER &&
          before &&
          f.memoizedProps &&
          !Object.is(before.value, f.memoizedProps.value) &&
          holdsElementView(f)
        )
          w.__changedContexts.push(`${w.__step}: ${describe(before.value, f.memoizedProps.value)}`);
        stack.push(f.child, f.sibling);
      }
    },
  };
}

const box = (page: Page, id: string) => page.locator(`${CANVAS} [data-element-id="${id}"]`).first();

async function centreOf(page: Page, id: string) {
  const r = (await box(page, id).boundingBox())!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

// Names the gesture the next commits belong to, for the failure message.
async function step(page: Page, name: string) {
  await page.evaluate((n) => ((window as unknown as { __step: string }).__step = n), name);
}

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++)
    await page.mouse.move(from.x + (by.x * i) / 8, from.y + (by.y * i) / 8);
  await page.mouse.up();
}

test('the contexts around the element views hold still through gestures and edits', async ({
  page,
  pageErrors,
}) => {
  await page.addInitScript(recordChangedContexts);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/new?blank=1');
  await page.locator(CANVAS).waitFor({ timeout: 30_000 });
  await seedTab(page, BOARD);
  await page.keyboard.press('v');
  await expect(box(page, 'a')).toBeVisible();
  await page.waitForTimeout(1000);
  await page.evaluate(() => ((window as unknown as { __recording: boolean }).__recording = true));

  const a = await centreOf(page, 'a');
  // Select, drag, deselect.
  await step(page, 'select');
  await page.mouse.click(a.x, a.y);
  // Past the double-click window, so the press drags rather than edits the label.
  await page.waitForTimeout(600);
  await step(page, 'drag');
  await drag(page, a, { x: 60, y: 40 });
  // The gestures run: the drag moved the box.
  await expect.poll(async () => Math.round((await centreOf(page, 'a')).x - a.x)).toBe(60);
  await page.keyboard.press('Escape');
  // A marquee over both boxes from bare canvas.
  await step(page, 'marquee');
  await drag(page, { x: 200, y: 200 }, { x: 800, y: 300 });
  await page.keyboard.press('Escape');
  // A pencil stroke, then undo it.
  await step(page, 'stroke');
  await page.keyboard.press('p');
  await drag(page, { x: 400, y: 650 }, { x: 200, y: 30 });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await step(page, 'undo');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(500);

  const changed = await page.evaluate(
    () => (window as unknown as { __changedContexts: string[] }).__changedContexts,
  );
  expect(changed).toEqual([]);
  expectNoPageErrors(pageErrors);
});
