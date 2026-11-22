import type { Page } from '@playwright/test';
import {
  expect,
  expectNoPageErrors,
  openStartBlank,
  savedTabElements,
  seedTab,
  test,
} from './fixtures';

// Several mind nodes selected (docs/specs/009-elements/mind-node.md "Several nodes selected", "Tidy Branches"): their
// menu holds the Mind Map row, lines between them carried along, and Tidy Branches lays out each selected branch.

test.use({ colorScheme: 'dark' });

const SHOTS = process.env.E2E_SHOTS_DIR;
const W = 200;
const H = 64;

const mindNode = (id: string, x: number, y: number, parent?: string) => ({
  id,
  type: 'shape',
  shape: 'mind-node',
  x,
  y,
  width: W,
  height: H,
  label: id.toUpperCase(),
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' }),
});
const connector = (from: string, to: string) => ({
  id: `${from}-${to}`,
  type: 'arrow',
  from: { kind: 'pinned', elementId: from, anchor: 'e' },
  to: { kind: 'pinned', elementId: to, anchor: 'w' },
  arrowEnds: 'none',
  arrowStyle: 'curved',
});

// A map arranged by hand: two parents, their children scattered.
const SEED = [
  mindNode('root', 80, 320),
  mindNode('a', 380, 120, 'root'),
  mindNode('a1', 900, 40, 'a'),
  mindNode('a2', 640, 260, 'a'),
  mindNode('b', 380, 520, 'root'),
  mindNode('b1', 1000, 420, 'b'),
  mindNode('b2', 700, 700, 'b'),
  connector('root', 'a'),
  connector('a', 'a1'),
  connector('a', 'a2'),
  connector('root', 'b'),
  connector('b', 'b1'),
  connector('b', 'b2'),
];

type Node = { id: string; x: number; y: number };

const element = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();
const selectionMenu = (page: Page) => page.getByRole('dialog', { name: 'Selection menu' });

async function openMindOutline(page: Page) {
  const menu = selectionMenu(page);
  await menu.getByRole('button', { name: /Mind Map/ }).click();
  await page.getByRole('button', { name: /^Outline/ }).click();
}

test('several mind nodes and the lines between them get the Mind Map row', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, SEED);
  // Select Branch takes the node, its children and the lines between them.
  await element(page, 'a').click({ button: 'right' });
  await page.getByRole('button', { name: /Mind Map/ }).click();
  await page.getByRole('button', { name: /^Outline/ }).click();
  await page.getByRole('button', { name: 'Select Branch' }).click();
  // The single node's menu closes on its pick or on Escape; the selection stays.
  const single = page.getByRole('dialog', { name: 'Element menu' });
  if (await single.isVisible()) await page.keyboard.press('Escape');
  await element(page, 'a').click({ button: 'right' });
  await expect(selectionMenu(page)).toBeVisible();
  await openMindOutline(page);
  await expect(page.getByRole('button', { name: 'Tidy Branches' })).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mind-several-menu.png` });
  expectNoPageErrors(pageErrors);
});

test('Tidy Branches lays out two selected parents\u2019 branches, nothing else moving', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, SEED);
  await element(page, 'a').click();
  await element(page, 'b').click({ modifiers: ['Shift'] });
  await element(page, 'b').click({ button: 'right' });
  await openMindOutline(page);
  await page.getByRole('button', { name: 'Tidy Branches' }).click();
  const at = (els: Node[], id: string) => els.find((e) => e.id === id)!;
  const els = await savedTabElements<Node>(page, (e) => {
    const a1 = e.find((x) => x.id === 'a1');
    return !!a1 && a1.x !== 900;
  });
  for (const id of ['root', 'a', 'b']) {
    const seeded = SEED.find((s) => s.id === id) as Node;
    expect({ x: at(els, id).x, y: at(els, id).y }).toEqual({ x: seeded.x, y: seeded.y });
  }
  // Each branch beside its parent, the children centred on it in the order drawn.
  for (const [parent, first, second] of [
    ['a', 'a1', 'a2'],
    ['b', 'b1', 'b2'],
  ] as const) {
    const p = at(els, parent);
    const c1 = at(els, first);
    const c2 = at(els, second);
    expect(c1.x).toBe(c2.x);
    expect(c1.x).toBeGreaterThan(p.x + W);
    expect(c1.y).toBeLessThan(c2.y);
    expect(Math.abs((c1.y + c2.y) / 2 - p.y)).toBeLessThanOrEqual(1);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mind-several-tidied.png` });
  expectNoPageErrors(pageErrors);
});
