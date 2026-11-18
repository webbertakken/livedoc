import type { Page } from '@playwright/test';
import {
  expect,
  expectNoPageErrors,
  openStartBlank,
  savedTabElements,
  seedTab,
  test,
} from './fixtures';

// A mind map grown in Sketch mode (docs/specs/009-elements/mind-node.md "Keyboard",
// docs/specs/023-draw-mode/draw-mode.md "Keyboard shortcuts"): a selected mind node takes typing as a note does, so a
// label's letters never arm the dock's shapes or eraser. Left to the dock, they would make the next press drop a shape
// over the node pressed on, or erase it and leave its children as roots of their own.

// Wide enough that Sketch's Quick style panel, on the left, covers none of the map.
test.use({ colorScheme: 'dark', viewport: { width: 1600, height: 900 } });

const SHOTS = process.env.E2E_SHOTS_DIR;

type Saved = {
  id: string;
  type: string;
  shape?: string;
  label?: string;
  mindParentId?: string;
  from?: { elementId?: string };
  to?: { elementId?: string };
};

const mindNode = (id: string, label: string, x: number, y: number, parent?: string) => ({
  id,
  type: 'shape',
  shape: 'mind-node',
  x,
  y,
  width: 160,
  height: 56,
  label,
  ...(parent ? { mindParentId: parent } : { mindFlow: 'tree' }),
});
const link = (from: string, to: string) => ({
  id: `${from}-${to}`,
  type: 'arrow',
  from: { kind: 'pinned', elementId: from, anchor: 'e' },
  to: { kind: 'pinned', elementId: to, anchor: 'w' },
  arrowEnds: 'none',
  arrowStyle: 'curved',
});

const node = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();
const halo = (page: Page, id: string) => page.locator(`[data-element-id="${id}"] [data-mind-halo]`);

async function intoSketch(page: Page) {
  await page.getByRole('button', { name: /^Editor mode: / }).click();
  await page.getByRole('menuitemradio', { name: 'Sketch' }).click();
  await expect(page.getByRole('button', { name: 'Editor mode: Sketch' })).toBeVisible();
  // Select in hand, the menu closed: the board as someone about to work on the map finds it.
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
}

test('a map grown and named from the keyboard in Sketch keeps every branch, with no shape dropped on it', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, [mindNode('trip', 'Trip ideas', 200, 200)]);
  await intoSketch(page);

  await node(page, 'trip').click();
  await page.keyboard.press('Tab');
  // "Beach" holds E (Eraser), A (Arrow) and C (Cylinder); "Rest" holds R (Rectangle), E and S (Shapes).
  await page.keyboard.type('Beach');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Rest');
  await page.keyboard.press('Escape');
  // The next press on the root selects it: nothing is dropped over it, and it is not erased.
  await node(page, 'trip').click();

  const els = await savedTabElements<Saved>(page, (e) => e.some((x) => x.label === 'Rest'));
  const nodes = els.filter((e) => e.shape === 'mind-node');
  expect(nodes.map((n) => n.label).sort()).toEqual(['Beach', 'Rest', 'Trip ideas']);
  for (const label of ['Beach', 'Rest'])
    expect(nodes.find((n) => n.label === label)?.mindParentId).toBe('trip');
  const arrows = els.filter((e) => e.type === 'arrow');
  expect(arrows).toHaveLength(2);
  for (const a of arrows) expect(a.from?.elementId).toBe('trip');
  // Nothing but the map: no rectangle, cylinder or other shape the letters could have armed.
  expect(els).toHaveLength(5);
  // Only the root wears the halo: no child became a root of its own.
  await expect(page.locator('[data-mind-halo]')).toHaveCount(1);
  await expect(halo(page, 'trip')).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/mind-sketch-grown.png` });
  expectNoPageErrors(pageErrors);
});

test('typing on a node of a ready-made map in Sketch renames it, and the next press arms nothing', async ({
  page,
  pageErrors,
}) => {
  // A map as a template or a converted flow leaves it: nodes with parents and their connectors.
  await openStartBlank(page);
  await seedTab(page, [
    mindNode('garden', 'Garden plan', 500, 320),
    mindNode('flowers', 'Flowers', 800, 200, 'garden'),
    mindNode('veg', 'Vegetables', 800, 440, 'garden'),
    link('garden', 'flowers'),
    link('garden', 'veg'),
  ]);
  await intoSketch(page);

  await node(page, 'flowers').click();
  await page.keyboard.type('Roses');
  await page.keyboard.press('Escape');
  await node(page, 'garden').click();
  await node(page, 'veg').click();

  const els = await savedTabElements<Saved>(page, (e) => e.some((x) => x.label === 'Roses'));
  expect(els).toHaveLength(5);
  expect(els.find((e) => e.id === 'flowers')).toMatchObject({
    label: 'Roses',
    mindParentId: 'garden',
  });
  expect(els.find((e) => e.id === 'veg')).toMatchObject({
    label: 'Vegetables',
    mindParentId: 'garden',
  });
  expect(
    els
      .filter((e) => e.type === 'arrow')
      .map((a) => a.id)
      .sort(),
  ).toEqual(['garden-flowers', 'garden-veg']);
  await expect(page.locator('[data-mind-halo]')).toHaveCount(1);
  await expect(halo(page, 'garden')).toHaveCount(1);
  expectNoPageErrors(pageErrors);
});
