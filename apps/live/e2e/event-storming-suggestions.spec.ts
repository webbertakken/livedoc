import type { Page } from '@playwright/test';
import { expect, pageOwnerHeaders, test } from './fixtures';
import { SUGGESTION_BOARD_IDS as IDS, startSuggestionBoard } from './suggestion-board';

// Suggestions in the editor (docs/specs/021-event-storming/suggestions.md), in a real browser: what only a browser
// can answer is whether the peek tabs, the preview, the keys and the panel reach the board the way the pure apply
// promises, and whether the board the server holds afterwards is that board.

test.use({ colorScheme: 'dark' });

type Stored = { id: string; x: number; y: number; esSuggestion?: unknown };

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

const byId = (els: Stored[], id: string) => els.find((el) => el.id === id)!;

test('a peek tab previews a suggestion with its reason, and Enter applies it', async ({ page }) => {
  await startSuggestionBoard(page);
  const tab = page.locator(`[data-suggestion-hint="${IDS.orderShipped}:before"]`);
  await expect(tab).toHaveAccessibleName(
    'Suggested before this domain event: Command “Ship order” and 1 more',
  );

  await tab.hover();
  const preview = page.locator(`[data-suggestion-placeholder="${IDS.shipOrder}"]`);
  await expect(preview).toBeVisible();
  // The chain previews with it, and the caption says why and who, never a gap code.
  await expect(page.locator(`[data-suggestion-placeholder="${IDS.clerk}"]`)).toBeVisible();
  const caption = page.locator('[data-suggestion-caption]');
  await expect(caption).toContainText('Nothing on the board causes the shipment');
  await expect(caption).toContainText('Suggested by Claude');
  await expect(caption).not.toContainText('event_without_cause');

  const before = await storedBoard(page);
  await tab.focus();
  await page.keyboard.press('Enter');
  const after = await storedBoard(page);
  const shipped = byId(after, IDS.orderShipped);
  const ship = byId(after, IDS.shipOrder);
  // An ordinary note, standing where the event stood; the event made room.
  expect(ship.esSuggestion).toBeUndefined();
  expect(ship.x).toBe(byId(before, IDS.orderShipped).x);
  expect(shipped.x).toBeGreaterThan(ship.x);
  // The chained actor waits on, now on a real note.
  expect(byId(after, IDS.clerk).esSuggestion).toMatchObject({ anchorId: IDS.shipOrder });

  // One Undo puts the whole board back.
  await page.keyboard.press('Control+z');
  const undone = await storedBoard(page);
  expect(byId(undone, IDS.shipOrder).esSuggestion).toBeDefined();
  expect(byId(undone, IDS.orderShipped).x).toBe(byId(before, IDS.orderShipped).x);
});

test('the panel opens collapsed, shows every suggestion, and applies them all', async ({
  page,
}) => {
  await startSuggestionBoard(page);
  const panel = page.getByRole('complementary', { name: 'Suggestions' });
  const toggle = panel.getByRole('button', { name: '5 suggestions' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.locator('[data-suggestion-row]')).toHaveCount(0);

  await toggle.click();
  await expect(panel.locator('[data-suggestion-row]')).toHaveCount(5);

  // Show All draws every placeholder and the board making room, as a preview only.
  const before = await storedBoard(page);
  await panel.getByRole('switch', { name: 'Show All Suggestions' }).click();
  await expect(page.locator('[data-suggestion-placeholder]')).toHaveCount(5);
  await expect(page.locator(`[data-element-id="${IDS.orderShipped}"]`).first()).toHaveAttribute(
    'style',
    /translateX\(/,
  );
  expect(byId(await storedBoard(page), IDS.orderShipped).x).toBe(byId(before, IDS.orderShipped).x);

  await panel.getByRole('button', { name: 'Apply All' }).click();
  await expect(panel).toHaveCount(0);
  const after = await storedBoard(page);
  expect(after.filter((el) => el.esSuggestion !== undefined)).toEqual([]);
  expect(after).toHaveLength(before.length);
});

test('Delete on a placeholder dismisses it and what is chained on it', async ({ page }) => {
  await startSuggestionBoard(page);
  await page.getByRole('button', { name: '5 suggestions' }).click();
  await page.getByRole('switch', { name: 'Show All Suggestions' }).click();
  const placeholder = page.getByRole('group', { name: 'Suggestion: Command “Ship order”' });
  await placeholder.focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-suggestion-placeholder]')).toHaveCount(3);
  const after = await storedBoard(page);
  expect(after.find((el) => el.id === IDS.shipOrder)).toBeUndefined();
  expect(after.find((el) => el.id === IDS.clerk)).toBeUndefined();
  // The board's notes are all still there.
  expect(after.find((el) => el.id === IDS.orderShipped)).toBeDefined();
});
