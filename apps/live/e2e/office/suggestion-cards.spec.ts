import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// Suggestion cards (docs/specs/034-text-documents/review.md "Suggestion cards"): a Participant's suggestions stand as
// cards in the margin for both; the Participant takes back their own with Reject (they have no Accept); the Editor
// accepts one, undoes it with ⌘Z, and moves to a suggestion with Ctrl+Alt+N then U. A reply on a card is a thread tied
// to it; the comments panel lists the suggestion, its press selects the card, and settling it resolves the thread.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-suggestion-card]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test('suggestion cards are accepted, rejected and undone', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('The fox jumps.');

  // A Participant on a share link starts in Suggesting.
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const origin = new URL(baseURL!).origin;
  const headers = await pageOwnerHeaders(page, { Origin: origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'participate' },
  });
  const code = ((await share.json()) as { link: { code: string } }).link.code;
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1440, height: 900 },
  });
  const peer = await ctx.newPage();
  await peer.goto(`/document/shared?s=${code}`);
  const join = peer.getByRole('button', { name: /^join$/i });
  await expect(join.or(peer.locator(READY))).toBeVisible({ timeout: 30_000 });
  if (await join.isVisible()) await join.click();
  await expect(peer.locator(READY)).toBeVisible();
  await expect(peer.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
  const peerBody = peer.locator(BODY);
  await expect(peerBody).toContainText('The fox jumps.');

  // Two suggestions apart: one at the end, one at the start.
  await peerBody.click();
  await peer.keyboard.press('End');
  await peer.keyboard.type(' Then it rests.');
  await peer.keyboard.press('Home');
  await peer.keyboard.type('Hey ');
  const peerCards = peer.locator(CARD);
  await expect(peerCards).toHaveCount(2);
  const late = page.locator(CARD).filter({ hasText: 'Add: “ Then it rests.”' });
  const early = page.locator(CARD).filter({ hasText: 'Add: “Hey ”' });
  await expect(late).toHaveCount(1, { timeout: 15_000 });
  await expect(early).toHaveCount(1);

  // The Participant has Reject on their own and no Accept; Reject takes it back for everyone.
  const peerEarly = peerCards.filter({ hasText: 'Add: “Hey ”' });
  await expect(peerEarly.getByRole('button', { name: 'Accept suggestion' })).toHaveCount(0);
  await peer.waitForTimeout(300);
  await peer.screenshot({ path: test.info().outputPath('suggestion-cards-participant.png') });
  await peerEarly.getByRole('button', { name: 'Reject suggestion' }).click();
  await expect(early).toHaveCount(0, { timeout: 15_000 });
  await expect(body).not.toContainText('Hey');

  // The Editor moves to the suggestion from the writing's start: Ctrl+Alt+N then U selects its card.
  await body.click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyN');
  await page.keyboard.press('KeyU');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(late).toHaveAttribute('aria-current', 'true');
  await expect(late).toBeFocused();
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggestion-cards-editor.png') });

  // The Editor accepts it: the text stays, plain, for both; ⌘Z brings the suggestion back.
  await late.getByRole('button', { name: 'Accept suggestion' }).click();
  await expect(late).toHaveCount(0);
  await expect(body.locator('.text-document-insertion')).toHaveCount(0);
  await expect(body).toContainText('The fox jumps. Then it rests.');
  await expect(peerCards).toHaveCount(0, { timeout: 15_000 });
  await body.click();
  await page.keyboard.press('Control+KeyZ');
  await expect(late).toHaveCount(1);
  await expect(body.locator('.text-document-insertion')).toHaveText(' Then it rests.');

  // The Participant replies on their suggestion; the Editor reads it in the card.
  const peerLate = peerCards.filter({ hasText: 'Add: “ Then it rests.”' });
  await expect(peerLate).toHaveCount(1, { timeout: 15_000 });
  await peerLate.click();
  await peerLate.getByRole('textbox').fill('Does it rest?');
  await peerLate.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(late).toContainText('Does it rest?', { timeout: 15_000 });
  // No card of its own: the reply lives in the suggestion's card.
  await expect(page.locator('[data-thread-card]:not([data-suggestion-card])')).toHaveCount(0);

  // The comments panel lists the suggestion with its reply; its press selects the card.
  await page.keyboard.press('Control+Alt+Shift+KeyA');
  const panel = page.getByRole('complementary', { name: 'Comments' });
  const row = panel.getByRole('button', { name: /^Go to suggestion by / });
  await expect(row).toHaveCount(1);
  await expect(panel).toContainText('1 reply');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggestion-cards-panel.png') });
  await row.click();
  await expect(late).toHaveAttribute('aria-current', 'true');

  // Accepted, its thread is resolved and waits in the panel.
  await late.getByRole('button', { name: 'Accept suggestion' }).click();
  await expect(row).toHaveCount(0);
  await panel.getByLabel('Which comments').selectOption('resolved');
  await expect(
    panel.getByRole('button', { name: /^Go to comment by .* on “Add: “ Then it rests/ }),
  ).toHaveCount(1);

  await ctx.close();
  expectNoPageErrors(pageErrors);
});
