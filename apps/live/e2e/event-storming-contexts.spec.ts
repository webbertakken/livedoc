import type { Locator, Page } from '@playwright/test';
import { expect, pageOwnerHeaders, test } from './fixtures';
import { CONTEXT_BOARD_IDS as IDS, startContextBoard } from './context-board';

// Candidate contexts in the editor (docs/specs/021-event-storming/candidate-contexts.md), in a real browser: what only
// a browser can answer is whether the outline follows its notes, whether a drag joins and leaves the way the pure
// drop rule promises, and whether the board the server holds afterwards says so.

test.use({ colorScheme: 'dark' });

type Stored = { id: string; label?: string; esContext?: { notes: string[]; suggestion?: unknown } };

async function storedBoard(page: Page): Promise<Stored[]> {
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
      ).json()) as { tab: { elements: Stored[] } };
      return tab.tab.elements;
    },
    { base: apiBase, headers },
  );
}

const contextIn = (els: Stored[], id: string) => els.find((el) => el.id === id);
const note = (page: Page, id: string) => page.locator(`[data-element-id="${id}"]`).first();
const outline = (page: Page, id: string) =>
  page.locator(`[data-candidate-context="${id}"] svg path`).first();

async function centre(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Press on a note, move through a few steps to `to`, and hold there.
async function dragTo(page: Page, from: Locator, to: { x: number; y: number }) {
  const start = await centre(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1)
    await page.mouse.move(
      start.x + ((to.x - start.x) * i) / 8,
      start.y + ((to.y - start.y) * i) / 8,
    );
}

test('a kept context is drawn round its notes, renamed from its name, and deleted', async ({
  page,
}) => {
  await startContextBoard(page);
  await expect(outline(page, IDS.ordering)).toHaveAttribute('stroke-dasharray', '10 10');
  const name = page.getByRole('button', { name: 'Candidate context: Ordering' });
  await expect(name).toBeVisible();

  await name.dblclick();
  const field = page.getByRole('textbox', { name: 'Candidate context name' });
  await field.fill('Placing orders');
  await field.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Candidate context: Placing orders' }),
  ).toBeFocused();
  expect(contextIn(await storedBoard(page), IDS.ordering)?.label).toBe('Placing orders');

  await page.keyboard.press('Delete');
  await expect(page.locator(`[data-candidate-context="${IDS.ordering}"]`)).toHaveCount(0);
  const after = await storedBoard(page);
  expect(contextIn(after, IDS.ordering)).toBeUndefined();
  // Its notes stay.
  expect(after.find((el) => el.id === IDS.placeOrder)).toBeDefined();
});

test('a suggested context shows faint, sits in the panel, and is kept by its ✓', async ({
  page,
}) => {
  await startContextBoard(page);
  const suggested = page.locator(`[data-candidate-context="${IDS.payments}"] svg`).first();
  await expect(suggested).toHaveCSS('opacity', '0.5');
  const panel = page.getByRole('complementary', { name: 'Suggestions' });
  await panel.getByRole('button', { name: '1 suggestion' }).click();
  await expect(panel.locator(`[data-suggestion-row="${IDS.payments}"]`)).toContainText(
    'Payments · 3 notes',
  );

  await page.getByRole('button', { name: 'Apply suggested candidate context: Payments' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Candidate context: Payments' })).toBeVisible();
  expect(contextIn(await storedBoard(page), IDS.payments)?.esContext?.suggestion).toBeUndefined();
});

test('dragging a note inside an outline joins it, highlighted while in hand', async ({ page }) => {
  await startContextBoard(page);
  // The free spot above Order placed, inside Ordering's outline.
  const column = await centre(note(page, IDS.orderPlaced));
  const lane = await centre(note(page, IDS.customer));
  await dragTo(page, note(page, IDS.orderShipped), { x: column.x, y: lane.y });
  await expect(outline(page, IDS.ordering)).toHaveAttribute('stroke', 'var(--ctx-active)');
  await page.mouse.up();
  await expect(outline(page, IDS.ordering)).toHaveAttribute('stroke', 'var(--ctx-line)');
  expect(contextIn(await storedBoard(page), IDS.ordering)?.esContext?.notes).toContain(
    IDS.orderShipped,
  );
});

test('dragging a note well clear of its outline lets it go', async ({ page }) => {
  await startContextBoard(page);
  const shipped = await centre(note(page, IDS.orderShipped));
  await dragTo(page, note(page, IDS.orderPlaced), { x: shipped.x + 500, y: shipped.y });
  await page.mouse.up();
  expect(contextIn(await storedBoard(page), IDS.ordering)?.esContext?.notes).not.toContain(
    IDS.orderPlaced,
  );
});

test('a note’s menu adds it to a context and takes it out again', async ({ page }) => {
  await startContextBoard(page);
  await note(page, IDS.orderShipped).click({ button: 'right' });
  const menu = page.getByRole('dialog', { name: 'Element menu' });
  await menu.getByRole('button', { name: 'Add to Context' }).click();
  await menu.getByRole('button', { name: 'Ordering' }).click();
  expect(contextIn(await storedBoard(page), IDS.ordering)?.esContext?.notes).toContain(
    IDS.orderShipped,
  );

  await note(page, IDS.orderShipped).click({ button: 'right' });
  await page
    .getByRole('dialog', { name: 'Element menu' })
    .getByRole('button', { name: 'Remove from Context' })
    .click();
  expect(contextIn(await storedBoard(page), IDS.ordering)?.esContext?.notes).not.toContain(
    IDS.orderShipped,
  );
});

test('Shift-click selects two contexts and the offer merges them into one, named afresh', async ({
  page,
}) => {
  await startContextBoard(page);
  await page.getByRole('button', { name: 'Candidate context: Ordering' }).click();
  await page
    .getByRole('button', { name: /^Suggested candidate context: Payments/ })
    .click({ modifiers: ['Shift'] });
  const offer = page.getByRole('group', { name: 'Merge 2 contexts' });
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Merge 2 contexts into one' }).click();
  const field = page.getByRole('textbox', { name: 'Candidate context name' });
  await field.fill('Ordering and paying');
  await field.press('Enter');
  const after = await storedBoard(page);
  const merged = contextIn(after, IDS.ordering)!;
  expect(merged.label).toBe('Ordering and paying');
  // Ordering was kept, so the merge is kept; it holds both contexts' notes.
  expect(merged.esContext?.suggestion).toBeUndefined();
  expect(merged.esContext?.notes).toEqual(
    expect.arrayContaining([IDS.placeOrder, IDS.takePayment]),
  );
  expect(contextIn(after, IDS.payments)).toBeUndefined();
});

test('New Context makes one round the selected notes, named afresh', async ({ page }) => {
  await startContextBoard(page);
  await note(page, IDS.takePayment).click();
  await note(page, IDS.orderShipped).click({ modifiers: ['Shift'] });
  await note(page, IDS.orderShipped).click({ button: 'right' });
  const menu = page.getByRole('dialog', { name: 'Selection menu' });
  // The board's selection menu: Text and New Context alone.
  await expect(menu.getByRole('button', { name: 'Layer' })).toHaveCount(0);
  await menu.getByRole('button', { name: 'New Context' }).click();
  const field = page.getByRole('textbox', { name: 'Candidate context name' });
  await field.fill('Fulfilment');
  await field.press('Enter');
  const made = (await storedBoard(page)).find((el) => el.label === 'Fulfilment');
  expect(made?.esContext?.notes).toEqual([IDS.takePayment, IDS.orderShipped]);
});

test('Draw Context makes one round the notes a drawn loop takes in', async ({ page }) => {
  await startContextBoard(page);
  await page.getByRole('button', { name: 'Draw Context' }).click();
  const box = (await note(page, IDS.orderShipped).boundingBox())!;
  const m = 30;
  const loop = [
    [box.x - m, box.y - m],
    [box.x + box.width + m, box.y - m],
    [box.x + box.width + m, box.y + box.height + m],
    [box.x - m, box.y + box.height + m],
  ];
  await page.mouse.move(loop[0]![0]!, loop[0]![1]!);
  await page.mouse.down();
  for (const [x, y] of [...loop.slice(1), loop[0]!]) await page.mouse.move(x!, y!, { steps: 6 });
  await page.mouse.up();
  const field = page.getByRole('textbox', { name: 'Candidate context name' });
  await field.fill('Shipping');
  await field.press('Enter');
  const made = (await storedBoard(page)).find((el) => el.label === 'Shipping');
  expect(made?.esContext?.notes).toEqual([IDS.orderShipped]);
  await expect(page.locator('[data-context-pen]')).toHaveCount(0);
});
