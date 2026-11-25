import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Comments in a text document (docs/specs/034-text-documents/review.md "Threads in the margin", "How a comment is
// kept"; share-roles: a Participant comments): Add comment on a selection opens a draft in the margin; Comment begins
// a thread, its text tinted and its card level with it; a Participant on a share link sees it and replies, which the
// room accepts as theirs; the thread stays after a reload; Resolve takes it from the margin for both.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test('a comment is added, replied to by a Participant, and resolved', async ({
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
  await page.keyboard.type('The quarterly results are in.');
  // Select "quarterly results" (16 characters after "The ").
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 17; i += 1) await page.keyboard.press('Shift+ArrowRight');

  // The margin's Add comment beside the selection; Insert > Comment does the same.
  const margin = page.getByRole('complementary', { name: 'Comment threads' });
  await expect(margin.getByRole('button', { name: 'Add comment' })).toBeVisible();
  await (await officeMenuItem(page, ['Insert', 'Comment'])).click();
  const draft = page.getByRole('group', { name: 'New comment' });
  await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type('Is this final?');
  await draft.getByRole('button', { name: 'Comment' }).click();

  const card = page.locator('[data-thread-card]:not([data-thread-card="draft"])');
  await expect(card).toHaveCount(1);
  await expect(card.getByText('Is this final?')).toBeVisible();
  const tint = body.locator('.text-document-comment');
  await expect(tint).toHaveText('quarterly results');
  // The card stands right of the page, level with its text.
  const pageBox = (await page.locator('[data-page-format]').boundingBox())!;
  expect((await card.boundingBox())!.x).toBeGreaterThan(pageBox.x + pageBox.width);
  await expect
    .poll(async () => Math.abs((await card.boundingBox())!.y - (await tint.boundingBox())!.y))
    .toBeLessThan(40);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('comment-thread.png') });

  // A Participant on a share link sees the thread and replies; the room takes it as theirs.
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
  const peerCard = peer.locator('[data-thread-card]');
  await expect(peerCard.getByText('Is this final?')).toBeVisible();
  await peerCard.click();
  await peerCard.getByRole('textbox', { name: 'Add a comment' }).fill('Yes, signed off.');
  await peerCard.getByRole('button', { name: 'Comment' }).click();
  await expect(card.getByText('Yes, signed off.')).toBeVisible({ timeout: 15_000 });
  // The Participant may not edit the Editor's comment, only their own.
  await expect(peerCard.getByRole('button', { name: 'Edit comment' })).toHaveCount(1);

  // The thread stays across a reload.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(card.getByText('Yes, signed off.')).toBeVisible();

  // Resolve takes it from the margin, for both.
  await card.getByRole('button', { name: 'Resolve' }).click();
  await expect(card).toHaveCount(0);
  await expect(peerCard).toHaveCount(0, { timeout: 15_000 });
  await expect(tint).toHaveCount(0);

  await ctx.close();
  expectNoPageErrors(pageErrors);
});

// The comments panel and the keys on a comment (review.md "The comments panel", "Keys on a selected comment"): two
// threads; Move to previous comment from the caret focuses the last card, K the one before it, E resolves it; the
// panel (⌘⌥⇧A) lists both, Resolved alone narrows it, Reopen brings the thread back, and a press on a row goes to it.
test('the comments panel lists, narrows, reopens and goes; the keys move between threads', async ({
  page,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('alpha beta gamma');
  const card = (text: string) =>
    page.locator('[data-thread-card]:not([data-thread-card="draft"])').filter({ hasText: text });
  const comment = async (text: string) => {
    await page.keyboard.press('Control+Alt+KeyM');
    const draft = page.getByRole('group', { name: 'New comment' });
    await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
    await page.keyboard.type(text);
    await draft.getByRole('button', { name: 'Comment' }).click();
    await expect(card(text)).toHaveCount(1);
  };
  // Ctrl+Alt held, a key then C (keyboard-shortcuts.md "Notation", a sequence).
  const chord = async (first: string) => {
    await page.keyboard.down('Control');
    await page.keyboard.down('Alt');
    await page.keyboard.press(first);
    await page.keyboard.press('KeyC');
    await page.keyboard.up('Alt');
    await page.keyboard.up('Control');
  };
  // "gamma", the word at the caret; then "alpha", selected.
  await comment('Second');
  await body.click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('Shift+ArrowRight');
  await comment('First');

  // With the caret in "gamma", Enter current comment focuses its card; K the one before; E resolves it.
  await body.click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await chord('KeyE');
  await expect(card('Second')).toBeFocused();
  await page.keyboard.press('k');
  await expect(card('First')).toBeFocused();
  await page.keyboard.press('e');
  await expect(card('First')).toHaveCount(0);
  await expect(body).toBeFocused();

  // The panel lists both; Resolved narrows it; Reopen returns the thread to the margin.
  await page.keyboard.press('Control+Alt+Shift+KeyA');
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await expect(page.getByRole('button', { name: 'Open comment history' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const rows = panel.getByRole('button', { name: /^Go to comment/ });
  await expect(rows).toHaveCount(2);
  await panel.getByLabel('Which comments').selectOption('resolved');
  await expect(rows).toHaveCount(1);
  await expect(panel.getByRole('status')).toHaveText('1 comment');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('comments-panel.png') });
  await panel.getByRole('button', { name: /^Reopen comment by / }).click();
  await expect(card('First')).toHaveCount(1);
  await panel.getByLabel('Which comments').selectOption('all');

  // A press on a row goes to its thread: selected in the margin, its card focused.
  await panel.getByRole('button', { name: /on “gamma”/ }).click();
  await expect(card('Second')).toBeFocused();
  await expect(card('Second')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('u');
  await expect(body).toBeFocused();
  await expect(card('Second')).not.toHaveAttribute('aria-current', 'true');

  // From the caret, none selected, Move to previous comment focuses the thread before it.
  await page.keyboard.press('End');
  await chord('KeyP');
  await expect(card('Second')).toBeFocused();

  expectNoPageErrors(pageErrors);
});

// Reactions (review.md "Reactions"): 👍 from the quick six on a comment, its chip pressed and counted; pressed again,
// taken back.
test('a reaction is added to a comment and taken back', async ({ page, pageErrors }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('alpha');
  await page.keyboard.press('Control+Alt+KeyM');
  const draft = page.getByRole('group', { name: 'New comment' });
  await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type('Nice');
  await draft.getByRole('button', { name: 'Comment' }).click();
  const card = page.locator('[data-thread-card]:not([data-thread-card="draft"])');
  await card.getByText('Nice').hover();
  await card.getByRole('button', { name: 'Add emoji reaction' }).click();
  await card.getByRole('button', { name: 'React with 👍' }).click();
  const chip = card.getByRole('button', { name: 'You reacted with 👍' });
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toHaveText('👍1');
  await page.screenshot({ path: test.info().outputPath('comment-reaction.png') });
  await chip.click();
  await expect(chip).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
