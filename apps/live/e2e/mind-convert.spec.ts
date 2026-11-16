import type { Page } from '@playwright/test';
import {
  expect,
  expectNoPageErrors,
  openStartBlank,
  savedTabElements,
  seedTab,
  test,
} from './fixtures';

// A flow converted into a mind map (docs/specs/009-elements/mind-node.md "Converting a flow"): the arrows between the
// converted nodes become the tree, its root found from them and its direction from where they are drawn.

test.use({ colorScheme: 'dark' });

const SHOTS = process.env.E2E_SHOTS_DIR;

const box = (id: string, label: string, x: number, y: number) => ({
  id,
  type: 'shape',
  shape: 'square',
  x,
  y,
  width: 140,
  height: 56,
  label,
});
const arrow = (from: string, to: string, label?: string) => ({
  id: `${from}-${to}`,
  type: 'arrow',
  from: { kind: 'pinned', elementId: from, anchor: 's' },
  to: { kind: 'pinned', elementId: to, anchor: 'n' },
  ...(label ? { label } : {}),
});

// A top-down process flow: a start, a decision fanning out to two steps, and a step after one of them, `dx` in from
// the left (clear of the desktop's quick style panel).
const flow = (dx: number) => [
  box('start', 'Start', dx + 120, 40),
  box('check', 'Check order', dx + 120, 170),
  box('ship', 'Ship it', dx + 20, 310),
  box('refund', 'Refund', dx + 220, 310),
  box('notify', 'Notify buyer', dx + 20, 450),
  arrow('start', 'check'),
  arrow('check', 'ship', 'in stock'),
  arrow('check', 'refund', 'sold out'),
  arrow('ship', 'notify'),
];
const IDS = ['start', 'check', 'ship', 'refund', 'notify'];

type Saved = {
  id: string;
  type: string;
  shape?: string;
  mindParentId?: string;
  mindFlow?: string;
  label?: string;
};

const element = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();

// Pick Mind Node from the open element menu's Shape category, through its search.
async function pickMindNode(page: Page) {
  await page.getByRole('button', { name: 'Shape', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search shapes' });
  await search.fill('mind');
  await search.press('Enter');
}

// The shape search keeps Escape to clear itself, so the menu is closed from outside the field.
async function closeMenu(page: Page) {
  const menu = page.getByRole('dialog', { name: /^(Element|Selection) menu$/ });
  await expect(async () => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden({ timeout: 500 });
  }).toPass();
}

const isMap = (els: Saved[]) =>
  IDS.every((id) => els.find((e) => e.id === id)?.shape === 'mind-node') &&
  els.find((e) => e.id === 'notify')?.mindParentId === 'ship';

test('a whole flow converted at once is a mind map, undone in one step', async ({
  page,
  pageErrors,
}) => {
  await openStartBlank(page);
  await seedTab(page, flow(400));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/convert-before.png` });

  await element(page, 'start').click();
  await page.keyboard.press('ControlOrMeta+a');
  await element(page, 'start').click({ button: 'right' });
  await pickMindNode(page);

  const els = await savedTabElements<Saved>(page, isMap);
  const parentOf = (id: string) => els.find((e) => e.id === id)?.mindParentId;
  expect(parentOf('start')).toBeUndefined();
  expect(parentOf('check')).toBe('start');
  expect(parentOf('ship')).toBe('check');
  expect(parentOf('refund')).toBe('check');
  expect(els.find((e) => e.id === 'start')?.mindFlow).toBe('downward');
  // Every arrow stays, its label with it.
  expect(els.filter((e) => e.type === 'arrow')).toHaveLength(4);
  expect(els.find((e) => e.id === 'check-ship')?.label).toBe('in stock');
  await closeMenu(page);
  await page.keyboard.press('Escape');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/convert-after.png` });

  // Branching works on it as on any map: the root's menu ticks Downward, and Tree re-lays it across.
  await element(page, 'start').click({ button: 'right' });
  await page.getByRole('button', { name: 'Mind Map', exact: true }).click();
  await page.getByRole('button', { name: 'Branching', exact: true }).click();
  const branching = page.getByRole('radiogroup', { name: 'Branching' });
  await expect(branching.getByRole('radio', { name: 'Downward' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await branching.getByRole('radio', { name: 'Tree' }).click();
  await savedTabElements<Saved>(page, (e) => e.find((x) => x.id === 'start')?.mindFlow === 'tree');
  await closeMenu(page);
  await page.keyboard.press('Escape');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/convert-tree.png` });
  await page.keyboard.press('ControlOrMeta+z');
  await savedTabElements<Saved>(
    page,
    (e) => e.find((x) => x.id === 'start')?.mindFlow === 'downward',
  );

  // The conversion is one step: one undo leaves the boxes as they were, and redo brings the map back.
  await page.keyboard.press('ControlOrMeta+z');
  const undone = await savedTabElements<Saved>(page, (e) =>
    IDS.every((id) => e.find((x) => x.id === id)?.shape === 'square'),
  );
  expect(undone.some((e) => e.mindParentId)).toBe(false);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await savedTabElements<Saved>(page, isMap);

  // It grows like any map: Add Child on a converted node joins the tree.
  await element(page, 'refund').click();
  await page.getByRole('button', { name: 'Add Child', exact: true }).click();
  await savedTabElements<Saved>(page, (e) => e.some((x) => x.mindParentId === 'refund'));
  expectNoPageErrors(pageErrors);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test('converting a flow node by node builds the map as it goes', async ({ page, pageErrors }) => {
    await openStartBlank(page);
    await seedTab(page, flow(0));

    for (const id of IDS) {
      await element(page, id).tap();
      await page.getByRole('button', { name: 'More actions' }).tap();
      await page.getByRole('button', { name: 'Shape', exact: true }).tap();
      await page.getByRole('button', { name: 'Mind Node', exact: true }).tap();
      await savedTabElements<Saved>(page, (e) => e.find((x) => x.id === id)?.shape === 'mind-node');
      await closeMenu(page);
      // Nothing selected, so the next node's tap is not taken by this one's grips.
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'More actions' })).toBeHidden();
    }

    const els = await savedTabElements<Saved>(page, isMap);
    expect(els.find((e) => e.id === 'refund')?.mindParentId).toBe('check');
    expect(els.find((e) => e.id === 'start')?.mindFlow).toBe('downward');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/convert-phone.png` });
    expectNoPageErrors(pageErrors);
  });
});
