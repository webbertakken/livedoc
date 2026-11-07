import type { Page } from '@playwright/test';
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
  let els = await savedElements(
    page,
    (e) => e.filter((x) => x.mindParentId === 'root').length === 3,
  );
  expect(els.filter((x) => x.mindParentId === 'root')).toHaveLength(3);

  await element(page, 'kid').click();
  await page.getByRole('button', { name: 'Add Parent', exact: true }).click();
  await page.keyboard.type('Style');
  await page.keyboard.press('Escape');
  els = await savedElements(page, (e) => {
    const kid = e.find((x) => x.id === 'kid');
    const above = e.find((x) => x.id === kid?.mindParentId);
    return above?.mindParentId === 'root' && above.label === 'Style';
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-parent.png` });
  expectNoPageErrors(pageErrors);
});
