import type { Page } from '@playwright/test';
import {
  contrastRatio,
  DARK_CANVAS_BACKGROUND_COLOR,
  DEFAULT_BACKGROUND_COLOR,
  MIND_HALO_MIN_CONTRAST,
} from '@livedoc/document';
import {
  expect,
  expectNoPageErrors,
  openStartBlank,
  savedTabElements,
  seedTab,
  test,
} from './fixtures';

// The root's halo (docs/specs/009-elements/mind-node.md "The root's halo"): every map's root wears one, a lone node
// does not, and it follows the root when the tree changes.

test.use({ colorScheme: 'dark' });

const SHOTS = process.env.E2E_SHOTS_DIR;

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

// Two maps and a lone node: a reader should find each map's root at a glance.
const SEED = [
  mindNode('garden', 'Garden plan', 400, 120),
  mindNode('flowers', 'Flowers', 640, 60, 'garden'),
  mindNode('veg', 'Vegetables', 640, 180, 'garden'),
  link('garden', 'flowers'),
  link('garden', 'veg'),
  mindNode('trip', 'Trip', 400, 380),
  mindNode('train', 'Train', 640, 380, 'trip'),
  link('trip', 'train'),
  mindNode('lone', 'Loose idea', 100, 380),
];

const halo = (page: Page, id: string) => page.locator(`[data-element-id="${id}"] [data-mind-halo]`);

async function expectHalos(page: Page, ringed: string[], plain: string[]) {
  for (const id of ringed) await expect(halo(page, id)).toHaveCount(1);
  for (const id of plain) await expect(halo(page, id)).toHaveCount(0);
}

for (const scheme of ['dark', 'light'] as const) {
  test(`every map's root wears a halo on the ${scheme} canvas, a lone node none`, async ({
    page,
    pageErrors,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openStartBlank(page);
    await seedTab(page, SEED);

    await expectHalos(page, ['garden', 'trip'], ['flowers', 'veg', 'train', 'lone']);
    // It sits outside the node and takes no pointer.
    const node = await page.locator('[data-element-id="garden"]').first().boundingBox();
    const ring = await halo(page, 'garden').boundingBox();
    expect(ring!.x).toBeLessThan(node!.x - 5);
    expect(ring!.width).toBeGreaterThan(node!.width + 10);
    await expect(halo(page, 'garden')).toHaveCSS('pointer-events', 'none');
    // WCAG 2.2 AA non-text contrast against the paper it is drawn on.
    const colour = await halo(page, 'garden').evaluate((el) => {
      const [r, g, b] = getComputedStyle(el).borderTopColor.match(/\d+/g)!.map(Number);
      return '#' + [r, g, b].map((n) => n!.toString(16).padStart(2, '0')).join('');
    });
    const paper = scheme === 'dark' ? DARK_CANVAS_BACKGROUND_COLOR : DEFAULT_BACKGROUND_COLOR;
    expect(contrastRatio(colour, paper)).toBeGreaterThanOrEqual(MIND_HALO_MIN_CONTRAST);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/halo-${scheme}.png` });
    expectNoPageErrors(pageErrors);
  });
}

test('the halo follows the root through Add Parent, and goes with its last child', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, SEED);

  await page.locator('[data-element-id="trip"]').first().click();
  await page.getByRole('button', { name: 'Add Parent', exact: true }).click();
  const els = await savedTabElements<{ id: string; mindParentId?: string }>(page, (e) =>
    Boolean(e.find((x) => x.id === 'trip')?.mindParentId),
  );
  const top = els.find((e) => e.id === 'trip')!.mindParentId!;
  await expectHalos(page, [top, 'garden'], ['trip']);

  // A map whose root loses its only child is a lone node again.
  await page.keyboard.press('Escape');
  await page.locator('[data-element-id="train"]').first().click();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
  await page.locator('[data-element-id="trip"]').first().click();
  await page.keyboard.press('Delete');
  await expectHalos(page, ['garden'], [top]);
  expectNoPageErrors(pageErrors);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test('the root of a map wears its halo', async ({ page, pageErrors }) => {
    await openStartBlank(page);
    await seedTab(page, [
      mindNode('garden', 'Garden plan', 20, 160),
      mindNode('flowers', 'Flowers', 200, 100, 'garden'),
      mindNode('veg', 'Vegetables', 200, 220, 'garden'),
      link('garden', 'flowers'),
      link('garden', 'veg'),
    ]);

    await expectHalos(page, ['garden'], ['flowers', 'veg']);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/halo-phone.png` });
    expectNoPageErrors(pageErrors);
  });
});
