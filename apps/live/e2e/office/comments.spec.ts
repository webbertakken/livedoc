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
  const margin = page.getByRole('complementary', { name: 'Comments' });
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
