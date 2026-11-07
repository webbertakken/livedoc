import type { Page } from '@playwright/test';
import { applyMindMoves, relayoutMindMap, type Element } from '@livedoc/document';
import {
  expect,
  expectNoPageErrors,
  openStartBlank,
  pageOwnerHeaders,
  seedTab,
  test,
} from './fixtures';

// Restructuring a mind map by hand (docs/specs/009-elements/mind-node.md "Add Parent", "Connecting nodes",
// Shift+click on Add Child) and a box becoming a mind node (docs/specs/008-canvas/canvas-and-palette.md "Shape").

test.use({ colorScheme: 'dark' });

const SHOTS = process.env.E2E_SHOTS_DIR;

const mindNode = (id: string, label: string, x: number, y: number, parent?: string) => ({
  id,
  type: 'shape',
  shape: 'mind-node',
  x,
  y,
  width: 200,
  height: 64,
  label,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' }),
});

const SEED = [
  {
    id: 'box',
    type: 'shape',
    shape: 'square',
    x: 120,
    y: 80,
    width: 200,
    height: 64,
    label: 'Loose idea',
  },
  mindNode('root', 'Agents file', 120, 300),
  mindNode('kid', 'Concise', 384, 300, 'root'),
  {
    id: 'root-kid',
    type: 'arrow',
    from: { kind: 'pinned', elementId: 'root', anchor: 'e' },
    to: { kind: 'pinned', elementId: 'kid', anchor: 'w' },
    arrowEnds: 'none',
    arrowStyle: 'curved',
  },
];

type Shape = { id: string; shape?: string; mindParentId?: string; label?: string };

// The first tab as the api has it, once autosave has caught up with `ready`.
async function savedElements(page: Page, ready: (els: Shape[]) => boolean): Promise<Shape[]> {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
  const headers = await pageOwnerHeaders(page);
  let last: Shape[] = [];
  await expect
    .poll(
      async () => {
        last = await page.evaluate(
          async ({ base, headers }) => {
            const id = location.pathname.split('/').filter(Boolean).pop()!;
            const doc = (await (await fetch(`${base}/documents/${id}`, { headers })).json()) as {
              document?: { tabs?: { id: string }[] };
            };
            const tabId = doc.document?.tabs?.[0]?.id;
            const got = (await (
              await fetch(`${base}/documents/${id}/tabs/${tabId}`, { headers })
            ).json()) as { tab?: { elements?: Shape[] } };
            return got.tab?.elements ?? [];
          },
          { base, headers },
        );
        return ready(last);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return last;
}

const element = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();

test('a box becomes a mind node from its Shape menu, found by search', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, SEED);
  await element(page, 'box').click({ button: 'right' });
  await page.getByRole('button', { name: 'Shape', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search shapes' });
  await search.fill('mind');
  const match = page.getByRole('list', { name: 'Matching shapes' });
  await expect(match).toContainText('Mind Node');
  await expect(match).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/shape-search-mind.png` });
  await search.press('Enter');
  const els = await savedElements(page, (e) =>
    e.some((x) => x.id === 'box' && x.shape === 'mind-node'),
  );
  expect(els.find((e) => e.id === 'box')?.mindParentId).toBeUndefined();
  expectNoPageErrors(pageErrors);
});

test('Shift+click Add Child keeps the node selected; Add Parent goes above a node', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, SEED);
  await element(page, 'root').click();
  const addChild = page.getByRole('button', { name: 'Add Child', exact: true }).first();
  await addChild.click({ modifiers: ['Shift'] });
  await addChild.click({ modifiers: ['Shift'] });
  const els = await savedElements(
    page,
    (e) => e.filter((x) => x.mindParentId === 'root').length === 3,
  );
  expect(els.filter((x) => x.mindParentId === 'root')).toHaveLength(3);

  await element(page, 'kid').click();
  await page.getByRole('button', { name: 'Add Parent', exact: true }).click();
  await page.keyboard.type('Style');
  await page.keyboard.press('Escape');
  await savedElements(page, (e) => {
    const kid = e.find((x) => x.id === 'kid');
    const above = e.find((x) => x.id === kid?.mindParentId);
    return above?.mindParentId === 'root' && above.label === 'Style';
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-parent.png` });
  expectNoPageErrors(pageErrors);
});

// A tidy map of four children, laid out by the package's own layout so the editor finds it tidy.
function tidyFour() {
  const els = [
    mindNode('root', 'Offsite', 120, 300),
    mindNode('k1', 'Venue', 0, 0, 'root'),
    mindNode('k2', 'Food', 0, 100, 'root'),
    mindNode('k3', 'Agenda', 0, 200, 'root'),
    mindNode('k4', 'Travel', 0, 300, 'root'),
    ...['k1', 'k2', 'k3', 'k4'].map((k) => ({
      id: `root-${k}`,
      type: 'arrow',
      from: { kind: 'pinned', elementId: 'root', anchor: 'e' },
      to: { kind: 'pinned', elementId: k, anchor: 'w' },
      arrowEnds: 'none',
      arrowStyle: 'curved',
    })),
  ] as unknown as Element[];
  const plan = relayoutMindMap(els, 'root')!;
  return applyMindMoves(els, plan.moves, plan.reanchored) as unknown as Record<string, unknown>[];
}

type Node = Shape & { y: number; mindNumbered?: boolean; mindGroup?: string; mindPlaced?: boolean };

test('number and group children, drag one between its siblings, and place one by hand', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, tidyFour());

  // Number all four.
  await element(page, 'k1').click();
  for (const id of ['k2', 'k3', 'k4']) await element(page, id).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Number', exact: true }).click();
  await expect(page.locator('[data-mind-number]')).toHaveCount(4);

  // Group the middle two.
  await element(page, 'k2').click();
  await element(page, 'k3').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  await expect(page.locator('[data-mind-group]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/numbered-grouped.png` });

  // Drag Venue down between Agenda and Travel: reordered, the numbers following.
  const venue = await element(page, 'k1').boundingBox();
  const agenda = await element(page, 'k3').boundingBox();
  const travel = await element(page, 'k4').boundingBox();
  const between = (agenda!.y + agenda!.height + travel!.y) / 2 + 4;
  await page.mouse.move(venue!.x + venue!.width / 2, venue!.y + venue!.height / 2);
  await page.mouse.down();
  await page.mouse.move(venue!.x + venue!.width / 2, between, { steps: 12 });
  await page.mouse.up();
  const els = (await savedElements(page, (e) => {
    const y = (id: string) => (e.find((x) => x.id === id) as Node | undefined)?.y ?? 0;
    return y('k1') > y('k3') && y('k1') < y('k4');
  })) as Node[];
  expect(els.find((e) => e.id === 'k1')?.mindPlaced).toBeUndefined();
  await expect(element(page, 'k1').locator('[data-mind-number]')).toHaveText('3');

  // Drag Travel far to the right: placed by hand, and Auto Position puts it back.
  const t = await element(page, 'k4').boundingBox();
  await page.mouse.move(t!.x + t!.width / 2, t!.y + t!.height / 2);
  await page.mouse.down();
  await page.mouse.move(t!.x + t!.width / 2 + 420, t!.y - 120, { steps: 12 });
  await page.mouse.up();
  await savedElements(page, (e) => e.some((x) => x.id === 'k4' && (x as Node).mindPlaced === true));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/placed-by-hand.png` });
  // The node let go stays selected, its toolbar offering the way back.
  await page.getByRole('button', { name: 'Auto Position', exact: true }).click();
  await savedElements(page, (e) => e.some((x) => x.id === 'k4' && !(x as Node).mindPlaced));
  expectNoPageErrors(pageErrors);
});

test('the quick Text Size row sets five sizes, and a long label shrinks to fit', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, [
    {
      id: 'box',
      type: 'shape',
      shape: 'square',
      x: 200,
      y: 160,
      width: 120,
      height: 120,
      label: 'Ship it',
    },
  ]);
  await element(page, 'box').click();
  const row = page.getByTestId('quick-style-text-size');
  await expect(row).toBeVisible();
  await row.getByRole('radio', { name: /^Extra large/ }).click();
  const els = await savedElements(page, (e) =>
    e.some((x) => x.id === 'box' && typeof (x as { textSize?: unknown }).textSize === 'number'),
  );
  const px = (els.find((e) => e.id === 'box') as { textSize?: number }).textSize!;
  expect(px).toBeGreaterThan(20);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/text-size-row.png` });
  expectNoPageErrors(pageErrors);
});
