import type { Page } from '@playwright/test';
import { freshDarkPage } from './audit-screens';
import { expect, pageOwnerHeaders, settledBox, test } from './fixtures';
import { LANE_BOARD_IDS as IDS, LANE_BOARD_PLAN as PLAN, startLaneBoard } from './lane-board';
import { expectNothingSuggested } from './suggestion-board';

// Lane plans and Arrange and Reorder in the editor (docs/specs/021-event-storming/lane-plans.md "How a person sees
// and decides", docs/specs/021-event-storming/arrange.md "How a person arranges"), in a real browser: what only a
// browser can answer is whether a whole board draws rearranged without being written, whether applying, keeping and
// dismissing reach the board the server holds as one step each, and whether a plan, which is an element, ever shows
// or can be taken into a selection.

test.use({ colorScheme: 'dark', launchOptions: { args: ['--mute-audio'] } });

type Stored = {
  id: string;
  type: string;
  label?: string;
  x: number;
  y: number;
  esLanePlan?: { lanes: { name: string; notes: string[] }[] };
};
type StoredTab = { elements: Stored[]; esDeclined?: unknown[] };

async function storedTab(page: Page): Promise<StoredTab> {
  // Let the debounced autosave flush before asking the server what it has.
  await page.waitForTimeout(1500);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
  const headers = await pageOwnerHeaders(page);
  return page.evaluate(
    async ({ base, headers }) => {
      const id = location.pathname.split('/').filter(Boolean).pop()!;
      const doc = (await (await fetch(`${base}/documents/${id}`, { headers })).json()) as {
        document: { tabs: { id: string }[] };
      };
      const tabId = doc.document.tabs[0]!.id;
      const tab = (await (
        await fetch(`${base}/documents/${id}/tabs/${tabId}`, { headers })
      ).json()) as { tab: StoredTab };
      return tab.tab;
    },
    { base: apiBase, headers },
  );
}

const byId = (tab: StoredTab, id: string) => tab.elements.find((el) => el.id === id)!;
const place = (tab: StoredTab, id: string) => [byId(tab, id).x, byId(tab, id).y];
const plans = (tab: StoredTab) => tab.elements.filter((el) => el.esLanePlan);
const laneNames = (tab: StoredTab) =>
  tab.elements
    .filter((el) => el.type === 'text')
    .sort((a, b) => a.y - b.y)
    .map((el) => el.label);

const note = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();
const panel = (page: Page) => page.getByTestId('suggestions-panel');
const bar = (page: Page) => page.getByTestId('board-offer-bar');
const planRow = (page: Page) => panel(page).locator('[data-suggestion-row^="lane-plan:"]');
const gliding = (page: Page) => page.locator('html[data-offer-glide]');

// A note's centre on screen: notes are tilted, so their boxes are bloated, but a centre stays a centre.
async function centre(page: Page, id: string): Promise<{ x: number; y: number; width: number }> {
  const box = (await note(page, id).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width };
}

// How many lanes `lower` stands below `upper`, to the nearest whole lane, whatever the zoom: a lane is 240 canvas
// units and a command or an event 200 wide.
async function lanesBelow(page: Page, upper: string, lower: string): Promise<number> {
  const [a, b, unit] = await Promise.all([
    centre(page, upper),
    centre(page, lower),
    centre(page, IDS.orderTaken),
  ]);
  return Math.round((b.y - a.y) / ((unit.width / 200) * 240));
}

// How far the second column stands from the first, in note widths.
async function columnsApart(page: Page): Promise<number> {
  const [first, second] = await Promise.all([
    centre(page, IDS.orderTaken),
    centre(page, IDS.dishPlated),
  ]);
  return (second.x - first.x) / first.width;
}

async function openPanel(page: Page, count = '1 suggestion'): Promise<void> {
  await panel(page).getByRole('button', { name: count, exact: true }).click();
}

async function run(page: Page, command: string): Promise<void> {
  await page.keyboard.press('ControlOrMeta+k');
  const search = page.getByRole('dialog', { name: 'Search' });
  await search.getByRole('combobox', { name: 'Search' }).fill(command);
  // The command, never a help article of the same name.
  await search
    .getByRole('group', { name: 'Actions' })
    .getByRole('option', { name: command, exact: true })
    .click();
  await expect(search).toHaveCount(0);
}

// Off the board and off the chrome, so nothing is pointed at.
const pointAway = (page: Page) => page.mouse.move(8, page.viewportSize()!.height / 2);

test('the panel lists the lane plan; pointing at it draws the board on its lanes, and writes nothing', async ({
  page,
}) => {
  await startLaneBoard(page, { plan: true });
  // A plan is a proposal: nothing paints it.
  await expect(note(page, IDS.plan)).toHaveCount(0);
  expect(await lanesBelow(page, IDS.waiter, IDS.orderTaken)).toBe(2);

  await openPanel(page);
  const row = planRow(page);
  await expect(panel(page).getByRole('listitem')).toHaveCount(1);
  await expect(row).toHaveAccessibleName('Lane plan: 2 lanes');
  await expect(row).toContainText(PLAN.reason);
  await expect(row).toContainText('Suggested by Claude');

  await row.hover();
  await expect(bar(page)).toHaveText('2 lanes · Reads the same');
  await expect(bar(page).getByRole('button')).toHaveCount(0);
  // The floor on one lane, the kitchen on the next, each lane named left of the wall.
  await expect.poll(() => lanesBelow(page, IDS.waiter, IDS.orderTaken)).toBe(0);
  await expect.poll(() => lanesBelow(page, IDS.waiter, IDS.tableServed)).toBe(0);
  await expect.poll(() => lanesBelow(page, IDS.waiter, IDS.cook)).toBe(1);
  await expect.poll(() => lanesBelow(page, IDS.fireTicket, IDS.dishPlated)).toBe(0);
  await expect(note(page, 'offered-lane-name-1')).toContainText('Front of house');
  await expect(note(page, 'offered-lane-name-2')).toContainText('Kitchen');
  // The row is still there to decide on, and the board the server holds is as it was.
  await expect(row.getByRole('button', { name: /^Apply suggestion/ })).toBeVisible();
  const stored = await storedTab(page);
  expect(place(stored, IDS.orderTaken)).toEqual([0, 480]);
  expect(laneNames(stored)).toEqual([]);
  expect(plans(stored)).toHaveLength(1);

  // Pointing away puts the board back, and the glide ends with it.
  await pointAway(page);
  await expect(bar(page)).toHaveCount(0);
  await expect.poll(() => lanesBelow(page, IDS.waiter, IDS.orderTaken)).toBe(2);
  await expect(note(page, 'offered-lane-name-1')).toHaveCount(0);
  await expect(gliding(page)).toHaveCount(0, { timeout: 1000 });
});

test('the row keeps the keyboard while it previews: Tab reaches ✓, and Enter applies the plan', async ({
  page,
}) => {
  await startLaneBoard(page, { plan: true });
  await openPanel(page);
  await planRow(page).focus();
  await expect(bar(page)).toHaveText('2 lanes · Reads the same');
  await expect(planRow(page)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(planRow(page).getByRole('button', { name: /^Apply suggestion/ })).toBeFocused();
  // The preview holds while the focus is inside the row.
  await expect.poll(() => lanesBelow(page, IDS.waiter, IDS.orderTaken)).toBe(0);
  await expect(bar(page)).toHaveText('2 lanes · Reads the same');
  await page.keyboard.press('Enter');
  await expectNothingSuggested(page);
  expect(laneNames(await storedTab(page))).toEqual(['Front of house', 'Kitchen']);
});

test('a lane name of the preview is not there to select: a press on it leaves nothing behind', async ({
  page,
}) => {
  await startLaneBoard(page, { plan: true });
  await openPanel(page);
  await planRow(page).focus();
  await expect(bar(page)).toHaveText('2 lanes · Reads the same');
  const name = (await note(page, 'offered-lane-name-1').boundingBox())!;
  await page.mouse.click(name.x + name.width / 2, name.y + name.height / 2);
  // The press took the focus from the row, so the preview ended; nothing of it stays, selected or written.
  await expect(note(page, 'offered-lane-name-1')).toHaveCount(0);
  await page.keyboard.press('Delete');
  const stored = await storedTab(page);
  expect(stored.elements).toHaveLength(11);
  expect(laneNames(stored)).toEqual([]);
});

test('✓ applies the plan as one step, lane names and all; one Undo takes it back', async ({
  page,
}) => {
  await startLaneBoard(page, { plan: true });
  await openPanel(page);
  await planRow(page)
    .getByRole('button', { name: 'Apply suggestion: Lane plan: 2 lanes', exact: true })
    .click();
  await expectNothingSuggested(page);
  await expect(bar(page)).toHaveCount(0);

  const after = await storedTab(page);
  expect(plans(after)).toHaveLength(0);
  expect(laneNames(after)).toEqual(['Front of house', 'Kitchen']);
  // Each note keeps its moment; where a column was too deep for its lane it opened to the right, in time order.
  expect(place(after, IDS.waiter)).toEqual([0, 30]);
  expect(place(after, IDS.takeOrder)).toEqual([156, 0]);
  expect(place(after, IDS.orderTaken)).toEqual([372, 0]);
  expect(byId(after, IDS.fireTicket).y).toBe(250);
  expect(byId(after, IDS.cook).y).toBe(270);
  expect(byId(after, IDS.dishPlated).y).toBe(240);
  expect(byId(after, IDS.tableServed).y).toBe(0);
  await expect(page.getByText('Front of house', { exact: true })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(panel(page).getByRole('button', { name: '1 suggestion' })).toBeVisible();
  const undone = await storedTab(page);
  expect(plans(undone)).toHaveLength(1);
  expect(laneNames(undone)).toEqual([]);
  expect(place(undone, IDS.orderTaken)).toEqual([0, 480]);
});

test('✕ and Dismiss All remove the plan and remember nothing', async ({ page }) => {
  await startLaneBoard(page, { plan: true });
  await openPanel(page);
  await planRow(page)
    .getByRole('button', { name: 'Dismiss suggestion: Lane plan: 2 lanes', exact: true })
    .click();
  await expectNothingSuggested(page);
  const after = await storedTab(page);
  expect(plans(after)).toHaveLength(0);
  expect(after.elements).toHaveLength(10);
  expect(place(after, IDS.orderTaken)).toEqual([0, 480]);
  expect(after.esDeclined ?? []).toEqual([]);

  // Undo brings the plan back, in the panel as it was left: open.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(planRow(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Dismiss All' }).click();
  await expectNothingSuggested(page);
  const again = await storedTab(page);
  expect(plans(again)).toHaveLength(0);
  expect(again.esDeclined ?? []).toEqual([]);
});

test('a plan the board outgrew says so, previews nothing and is left by Apply All: ✕ alone', async ({
  page,
}) => {
  await startLaneBoard(page, { plan: true });
  await note(page, IDS.waiter).click();
  await page.keyboard.press('Delete');
  await expect(note(page, IDS.waiter)).toHaveCount(0);

  await openPanel(page);
  const row = planRow(page);
  await expect(row).toHaveAccessibleName(
    'Lane plan: 2 lanes. The board changed since this plan was made. Ask again.',
  );
  await expect(row.getByRole('button', { name: /^Apply suggestion/ })).toHaveCount(0);
  await row.hover();
  await expect(bar(page)).toHaveCount(0);
  expect(await lanesBelow(page, IDS.takeOrder, IDS.orderTaken)).toBe(1);

  await panel(page).getByRole('button', { name: 'Apply All' }).click();
  await expect(row).toBeVisible();
  expect(place(await storedTab(page), IDS.orderTaken)).toEqual([0, 480]);

  await row.getByRole('button', { name: /^Dismiss suggestion: Lane plan/ }).click();
  await expectNothingSuggested(page);
  expect(plans(await storedTab(page))).toHaveLength(0);
});

test('a plan is never in a selection: Select All and a marquee take the notes and leave it', async ({
  page,
}) => {
  await startLaneBoard(page, { plan: true });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await expect(note(page, IDS.orderTaken)).toHaveCount(0);
  const emptied = await storedTab(page);
  expect(emptied.elements.map((el) => el.id)).toEqual([IDS.plan]);

  await page.keyboard.press('ControlOrMeta+z');
  await note(page, IDS.orderTaken).waitFor();
  // A marquee round the first column, begun on empty canvas left of it, once the notes the Undo brought back
  // stand still: a box read while they settle ends the marquee short of the column's last note.
  const waiter = await settledBox(note(page, IDS.waiter));
  const taken = await settledBox(note(page, IDS.orderTaken));
  await page.mouse.move(waiter.x - 30, waiter.y - 20);
  await page.mouse.down();
  await page.mouse.move(taken.x + taken.width + 20, taken.y + taken.height + 20, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  await expect(note(page, IDS.orderTaken)).toHaveCount(0);
  const after = await storedTab(page);
  expect(after.elements.map((el) => el.id).sort()).toEqual(
    [
      IDS.plan,
      IDS.fireTicket,
      IDS.cook,
      IDS.plateDish,
      IDS.dishPlated,
      IDS.runner,
      IDS.serveTable,
      IDS.tableServed,
    ].sort(),
  );
});

test('Arrange and Reorder previews the board along its timeline; Escape and Put Back restore it, Keep writes one step', async ({
  page,
}) => {
  await startLaneBoard(page);
  await expectNothingSuggested(page);
  expect(await columnsApart(page)).toBeGreaterThan(3);

  await run(page, 'Arrange and Reorder');
  await expect(bar(page)).toContainText('Arranged and reordered along the timeline');
  // The suggestions corner stands down, Ask pill and all, while the board is the preview's.
  await expect(panel(page)).toHaveCount(0);
  // The columns close up; every note stays on its lane; the board is not written.
  await expect.poll(() => columnsApart(page)).toBeLessThan(2);
  expect(await lanesBelow(page, IDS.waiter, IDS.orderTaken)).toBe(2);
  expect(place(await storedTab(page), IDS.dishPlated)).toEqual([760, 480]);

  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await expectNothingSuggested(page);
  await expect.poll(() => columnsApart(page)).toBeGreaterThan(3);
  await expect(gliding(page)).toHaveCount(0, { timeout: 1000 });

  await run(page, 'Arrange and Reorder');
  await bar(page).getByRole('button', { name: 'Put Back', exact: true }).click();
  await expect(bar(page)).toHaveCount(0);
  await expect.poll(() => columnsApart(page)).toBeGreaterThan(3);

  await run(page, 'Arrange and Reorder');
  await bar(page).getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(bar(page)).toHaveCount(0);
  const kept = await storedTab(page);
  expect(place(kept, IDS.orderTaken)).toEqual([50, 480]);
  expect(place(kept, IDS.fireTicket)).toEqual([0, 730]);
  expect(place(kept, IDS.dishPlated)).toEqual([348, 480]);
  expect(place(kept, IDS.tableServed)).toEqual([596, 480]);
  expect(kept.elements).toHaveLength(10);

  // Arranged, there is nothing to arrange: said in a line, with no bar.
  await run(page, 'Arrange and Reorder');
  await expect(page.getByText('Already arranged.', { exact: true })).toBeVisible();
  await expect(bar(page)).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => columnsApart(page)).toBeGreaterThan(3);
  expect(place(await storedTab(page), IDS.dishPlated)).toEqual([760, 480]);
});

test('a drag in hand ends the arranging preview: the board is the drag’s', async ({ page }) => {
  await startLaneBoard(page);
  await run(page, 'Arrange and Reorder');
  await expect.poll(() => columnsApart(page)).toBeLessThan(2);
  const cook = await centre(page, IDS.cook);
  await page.mouse.move(cook.x, cook.y);
  await page.mouse.down();
  await page.mouse.move(cook.x + 40, cook.y, { steps: 4 });
  await expect(bar(page)).toHaveCount(0);
  await page.mouse.up();
  // Only the note in hand moved, from where it stood on the board, not from where the preview drew it.
  const after = await storedTab(page);
  expect(place(after, IDS.dishPlated)).toEqual([760, 480]);
  expect(byId(after, IDS.cook).x).toBeGreaterThan(400);
});

test('a note that stays in the way refuses the arrangement, and is a way in to fix the board', async ({
  page,
}) => {
  await startLaneBoard(page, { inTheWay: true });
  await run(page, 'Arrange and Reorder');
  const refusal = bar(page).getByRole('group', { name: 'Board not arranged' });
  await expect(refusal).toContainText('A note that stays where it is stands in the way.');
  expect(await columnsApart(page)).toBeGreaterThan(3);

  await refusal.getByRole('button', { name: 'Show on the board: “Who calls the pass?”' }).click();
  // The note is selected: unlocking it is offered, which only a selected locked note is.
  await expect(page.getByRole('button', { name: /^Unlock/ }).first()).toBeVisible();

  await refusal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(bar(page)).toHaveCount(0);
  expect((await storedTab(page)).elements).toHaveLength(11);
});

// Share roles (docs/specs/021-event-storming/lane-plans.md "Share roles", docs/specs/021-event-storming/arrange.md
// "Share roles"): a plan and arranging reshape the board, so both are an Editor's.
for (const role of ['participate', 'view'] as const)
  test(`someone who opens the board through a ${role} link sees no lane plan and cannot arrange`, async ({
    page,
    browser,
  }) => {
    await startLaneBoard(page, { plan: true });
    const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
    const headers = await pageOwnerHeaders(page, { 'Content-Type': 'application/json' });
    const code = await page.evaluate(
      async ({ base, headers, role }) => {
        const id = location.pathname.split('/').filter(Boolean).pop()!;
        const res = await fetch(`${base}/documents/${id}/share`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ role }),
        });
        return ((await res.json()) as { link: { code: string } }).link.code;
      },
      { base: apiBase, headers, role },
    );

    const guest = await freshDarkPage(browser);
    await guest.goto(`/document/shared?s=${code}`);
    // A visitor with no identity yet is greeted by the Join dialog.
    await guest.getByRole('button', { name: /^join$/i }).click();
    await note(guest, IDS.orderTaken).waitFor();
    await expect(guest.getByTestId('suggestions-panel')).toHaveCount(0);
    await expect(note(guest, IDS.plan)).toHaveCount(0);

    await guest.keyboard.press('ControlOrMeta+k');
    const search = guest.getByRole('dialog', { name: 'Search' });
    await search.getByRole('combobox', { name: 'Search' }).fill('Arrange and Reorder');
    // The search answers (fitting the board is everyone's), and arranging is not among its answers.
    await search.getByRole('combobox', { name: 'Search' }).fill('Fit to Screen');
    await expect(search.getByRole('option', { name: 'Fit to Screen', exact: true })).toBeVisible();
    await search.getByRole('combobox', { name: 'Search' }).fill('Arrange and Reorder');
    // The help article of that name is everyone's to read; the command is not offered.
    await expect(
      search
        .getByRole('group', { name: 'Actions' })
        .getByRole('option', { name: 'Arrange and Reorder' }),
    ).toHaveCount(0);
    await expect(
      search
        .getByRole('group', { name: 'Help' })
        .getByRole('option', { name: 'Arrange and Reorder' }),
    ).toBeVisible();
    await guest.context().close();
  });
