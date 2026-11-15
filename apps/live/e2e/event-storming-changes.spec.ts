import type { Page } from '@playwright/test';
import { freshDarkPage } from './audit-screens';
import { expect, pageOwnerHeaders, test } from './fixtures';
import {
  CHANGE_BOARD_CHANGES as CHANGES,
  CHANGE_BOARD_IDS as IDS,
  CHANGE_BOARD_NAMES as NAMES,
  startChangeBoard,
} from './change-board';
import { expectNothingSuggested } from './suggestion-board';

// Suggested changes in the editor (docs/specs/021-event-storming/suggested-changes.md "How a person sees and
// decides", "Accepting"), in a real browser: what only a browser can answer is whether a preview draws over the
// board without writing it, whether accepting and dismissing reach the board the server holds, whether a dismissal
// is remembered there, and whether one Undo takes each back.

test.use({ colorScheme: 'dark' });

type Stored = {
  id: string;
  type: string;
  label?: string;
  x: number;
  esKind?: string;
  esSuggestion?: unknown;
  esChanges?: { change: string }[];
  esContext?: {
    notes: string[];
    names?: { name: string; with?: string[] }[];
    suggestion?: unknown;
  };
};
type StoredTab = {
  elements: Stored[];
  esDeclined?: { type: string; words?: string; about: string[] }[];
};

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

const byId = (tab: StoredTab, id: string) => tab.elements.find((el) => el.id === id);
const note = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();
const mark = (page: Page, id: string) => page.locator(`[data-change-mark="${id}"]`);
const caption = (page: Page) => page.locator('[data-change-caption]');
const contextName = (page: Page, id: string) => page.locator(`[data-context-name-for="${id}"]`);
const chip = (page: Page, name: string) => page.locator(`[data-name-chip="${name}"]`);

test('a change mark previews a reword through its context without writing, and ✓ accepts it', async ({
  page,
}) => {
  await startChangeBoard(page);
  await expect(mark(page, IDS.packOrder)).toHaveAccessibleName(
    'Suggested change to this command: Reword “Pack parcel”',
  );
  await expect(mark(page, IDS.packedAndShipped)).toHaveText('Split +1');

  await mark(page, IDS.packOrder).hover();
  // The note and the notes of its context that hold the term draw their new words; the board is untouched.
  await expect(note(page, IDS.packOrder)).toContainText('Pack parcel');
  await expect(note(page, IDS.packedAndShipped)).toContainText('Parcel packed and shipped');
  await expect(note(page, IDS.orderPlaced)).toContainText('Order placed');
  await expect(caption(page)).toContainText(
    'Also rewords 2 notes in Fulfilment · 2 more on the board',
  );
  await expect(caption(page)).toContainText('Suggested by Claude');
  expect(byId(await storedTab(page), IDS.packOrder)?.label).toBe('Pack order');

  // Everywhere previews the reword across the board.
  await mark(page, IDS.packOrder).hover();
  await caption(page)
    .getByRole('button', { name: /^Accept everywhere/ })
    .hover();
  await expect(note(page, IDS.orderPlaced)).toContainText('Parcel placed');

  await caption(page)
    .getByRole('button', { name: /^Accept: Reword/ })
    .click();
  await expect(mark(page, IDS.packOrder)).toHaveCount(0);
  const after = await storedTab(page);
  expect(byId(after, IDS.packOrder)?.label).toBe('Pack parcel');
  expect(byId(after, IDS.orderSent)?.label).toBe('Parcel was shipped');
  expect(byId(after, IDS.orderPlaced)?.label).toBe('Order placed');
  expect(byId(after, IDS.packOrder)?.esChanges).toBeUndefined();

  // One Undo puts every note back, with the suggestion.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(note(page, IDS.packedAndShipped)).toContainText('Order packed and shipped');
  await expect(mark(page, IDS.packOrder)).toBeVisible();
});

test('Enter on a mark accepts a split: its parts land after the note, in its context', async ({
  page,
}) => {
  await startChangeBoard(page);
  await mark(page, IDS.packedAndShipped).focus();
  // The preview draws the first part on the note and the other as a placeholder, the board making room.
  await expect(note(page, IDS.packedAndShipped)).toContainText('Order packed');
  await expect(page.locator('[data-change-part="Order shipped"]')).toBeVisible();
  const before = await storedTab(page);
  expect(before.elements).toHaveLength(14);

  await page.keyboard.press('Enter');
  const after = await storedTab(page);
  const part = after.elements.find((el) => el.label === 'Order shipped')!;
  const packed = byId(after, IDS.packedAndShipped)!;
  expect(packed.label).toBe('Order packed');
  expect(part).toMatchObject({ type: 'sticky', esKind: 'domain-event' });
  expect(part.esSuggestion).toBeUndefined();
  expect(part.x).toBeGreaterThan(packed.x);
  // The note that stood after it made room, and the part joined Fulfilment.
  expect(byId(after, IDS.orderSent)!.x).toBeGreaterThan(byId(before, IDS.orderSent)!.x);
  expect(byId(after, IDS.fulfilment)!.esContext!.notes).toContain(part.id);
  // The note's other change is still the person's to decide.
  expect(packed.esChanges).toEqual([expect.objectContaining({ change: 'reword' })]);
  await expect(mark(page, IDS.packedAndShipped)).toBeVisible();
});

test('a kind change and a removal preview on the note, and Delete on a mark is remembered as declined', async ({
  page,
}) => {
  await startChangeBoard(page);
  const refund = note(page, IDS.refund);
  const paper = () => refund.evaluate((el) => getComputedStyle(el).backgroundColor);
  const asEvent = await paper();
  await mark(page, IDS.refund).hover();
  await expect(caption(page)).toContainText('Change kind');
  await expect.poll(paper).not.toBe(asEvent);

  await mark(page, IDS.orderSent).hover();
  await expect(page.locator(`[data-change-strike="${IDS.orderSent}"]`)).toBeVisible();
  await expect(caption(page)).toContainText('Remove');
  // The note stands at the board's right end: its caption, wider than the note, stays inside the window.
  await expect
    .poll(async () => {
      const box = (await caption(page).boundingBox())!;
      return box.x + box.width;
    })
    .toBeLessThanOrEqual(page.viewportSize()!.width);

  await mark(page, IDS.orderSent).focus();
  await page.keyboard.press('Delete');
  await expect(mark(page, IDS.orderSent)).toHaveCount(0);
  const after = await storedTab(page);
  expect(byId(after, IDS.orderSent)).toBeDefined();
  expect(byId(after, IDS.orderSent)!.esChanges).toBeUndefined();
  expect(after.esDeclined).toEqual([{ type: 'remove', about: [IDS.orderSent] }]);

  // One Undo brings the suggestion back and forgets the dismissal.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(mark(page, IDS.orderSent)).toBeVisible();
  expect((await storedTab(page)).esDeclined ?? []).toEqual([]);
});

test('a selected context shows its suggested names as chips; a chip previews and renames it', async ({
  page,
}) => {
  await startChangeBoard(page);
  const ordering = contextName(page, IDS.ordering);
  await expect(ordering).toHaveAccessibleName('Candidate context: Ordering, 3 names suggested');
  await expect(chip(page, NAMES.ordering[0])).toHaveCount(0);

  await ordering.click();
  for (const name of NAMES.ordering) await expect(chip(page, name)).toBeVisible();

  await chip(page, NAMES.ordering[1]).hover();
  await expect(ordering).toContainText(NAMES.ordering[1]);
  await expect(page.locator('[data-name-caption]')).toContainText('Suggested by Claude');
  expect(byId(await storedTab(page), IDS.ordering)?.label).toBe('Ordering');

  await chip(page, NAMES.ordering[1]).click();
  await expect(chip(page, NAMES.ordering[0])).toHaveCount(0);
  const after = await storedTab(page);
  expect(byId(after, IDS.ordering)?.label).toBe(NAMES.ordering[1]);
  // Its other names for itself are dropped; the name for the merge stays.
  expect(byId(after, IDS.ordering)?.esContext?.names).toEqual([
    expect.objectContaining({ name: NAMES.merged, with: [IDS.payments] }),
  ]);
  expect(after.esDeclined).toBeUndefined();
});

test('✕ after the chips dismisses the names shown, and the board remembers them', async ({
  page,
}) => {
  await startChangeBoard(page);
  await contextName(page, IDS.ordering).click();
  await chip(page, NAMES.ordering[2]).focus();
  await page.keyboard.press('Delete');
  await expect(chip(page, NAMES.ordering[2])).toHaveCount(0);
  await expect(chip(page, NAMES.ordering[0])).toBeVisible();

  await page.getByRole('button', { name: 'Dismiss name suggestions', exact: true }).click();
  await expect(chip(page, NAMES.ordering[0])).toHaveCount(0);
  const after = await storedTab(page);
  expect(after.esDeclined?.map((d) => [d.type, d.words, d.about])).toEqual([
    ['name', NAMES.ordering[2], [IDS.ordering]],
    ['name', NAMES.ordering[0], [IDS.ordering]],
    ['name', NAMES.ordering[1], [IDS.ordering]],
  ]);
  // The context stays, under its own name.
  expect(byId(after, IDS.ordering)?.label).toBe('Ordering');
});

test('the merge offer holds the name for the selected contexts: choosing it merges and names in one step', async ({
  page,
}) => {
  await startChangeBoard(page);
  await contextName(page, IDS.ordering).click();
  await contextName(page, IDS.payments).click({ modifiers: ['Shift'] });
  const offer = page.locator('[data-context-merge]');
  await expect(offer).toContainText('Merge 2 contexts');
  await expect(offer.locator(`[data-name-chip="${NAMES.merged}"]`)).toBeVisible();

  await offer.getByRole('button', { name: `Merge and name ${NAMES.merged}` }).click();
  await expect(offer).toHaveCount(0);
  // The merged context is selected under its new name, which is not opened for typing.
  await expect(page.getByRole('textbox', { name: 'Candidate context name' })).toHaveCount(0);
  const after = await storedTab(page);
  const contexts = after.elements.filter((el) => el.esContext);
  expect(contexts.map((c) => c.label).sort()).toEqual(['Fulfilment', NAMES.merged].sort());
  const merged = contexts.find((c) => c.label === NAMES.merged)!;
  expect(merged.esContext!.notes).toHaveLength(8);
  // Ordering was kept, so the merged context is kept, not suggested.
  expect(merged.esContext!.suggestion).toBeUndefined();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(contextName(page, IDS.payments)).toBeVisible();
});

test('the panel lists names, merges and note changes; Dismiss All drops and remembers them all', async ({
  page,
}) => {
  await startChangeBoard(page);
  const panel = page.getByTestId('suggestions-panel');
  // The suggested context, two Names rows, a Merge row and five note changes.
  await panel.getByRole('button', { name: '9 suggestions' }).click();
  const rows = panel.getByRole('listitem');
  await expect(rows).toHaveCount(9);
  await expect(rows.filter({ hasText: 'Names Ordering' })).toContainText(NAMES.ordering.join(', '));
  await expect(rows.filter({ hasText: 'Merge Ordering + Payments' })).toContainText(NAMES.merged);

  // A change row previews as its mark does.
  await rows.filter({ hasText: 'Change kind Command' }).hover();
  await expect(caption(page)).toContainText(CHANGES.kind.reason);

  // Choosing a Names row selects its context, whose chips then show on the board.
  await panel
    .getByRole('button', { name: 'Show name suggestions for Ordering', exact: true })
    .click();
  await expect(chip(page, NAMES.ordering[0])).toBeVisible();

  await panel.getByRole('button', { name: 'Dismiss All' }).click();
  await expectNothingSuggested(page);
  await expect(page.locator('[data-change-mark]')).toHaveCount(0);
  const after = await storedTab(page);
  expect(after.elements.some((el) => el.esChanges || el.esContext?.names)).toBe(false);
  expect(byId(after, IDS.payments)).toBeUndefined();
  expect(after.esDeclined?.map((d) => d.type).sort()).toEqual(
    [
      'context',
      'kind',
      'name',
      'name',
      'name',
      'name',
      'name',
      'remove',
      'reword',
      'reword',
      'split',
    ].sort(),
  );
});

test('Apply All takes each context’s first name and each note’s first change in one undoable step', async ({
  page,
}) => {
  await startChangeBoard(page);
  const panel = page.getByTestId('suggestions-panel');
  await panel.getByRole('button', { name: '9 suggestions' }).click();
  await panel.getByRole('button', { name: 'Apply All' }).click();

  const after = await storedTab(page);
  expect(byId(after, IDS.ordering)?.label).toBe(NAMES.ordering[0]);
  expect(byId(after, IDS.payments)?.label).toBe(NAMES.payments[0]);
  expect(byId(after, IDS.payments)?.esContext?.suggestion).toBeUndefined();
  expect(byId(after, IDS.packOrder)?.label).toBe('Pack parcel');
  expect(byId(after, IDS.refund)?.esKind).toBe('command');
  expect(byId(after, IDS.orderSent)).toBeUndefined();
  expect(after.elements.some((el) => el.label === 'Order shipped')).toBe(true);
  // What Apply All does not take stays open: the merge's name, and the split note's second change.
  await expect(panel.getByRole('button', { name: '2 suggestions' })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(panel.getByRole('button', { name: '9 suggestions' })).toBeVisible();
  await expect(note(page, IDS.orderSent)).toBeVisible();
});

// Share roles (docs/specs/021-event-storming/suggested-changes.md "Share roles"): a Participant and a Viewer see the
// board and its kept contexts, and nothing of what is suggested.
for (const role of ['participate', 'view'] as const)
  test(`someone who opens the board through a ${role} link sees none of the suggested changes`, async ({
    page,
    browser,
  }) => {
    await startChangeBoard(page);
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
    await note(guest, IDS.packOrder).waitFor();
    // The kept contexts are everyone's; the suggested one, the marks, the counts and the panel are an Editor's.
    await expect(guest.getByText('Fulfilment', { exact: true })).toBeVisible();
    await expect(guest.getByText('Payments', { exact: true })).toHaveCount(0);
    await expect(guest.locator('[data-change-mark]')).toHaveCount(0);
    await expect(guest.locator('[data-context-name-count]')).toHaveCount(0);
    await expect(guest.getByTestId('suggestions-panel')).toHaveCount(0);
    // Its name takes no press from them: a click where it stands selects nothing and shows no chip.
    const name = (await guest.getByText('Ordering', { exact: true }).boundingBox())!;
    await guest.mouse.click(name.x + name.width / 2, name.y + name.height / 2);
    await expect(guest.locator('[data-name-chip]')).toHaveCount(0);
    await guest.context().close();
  });
