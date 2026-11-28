import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Comments in a spreadsheet (docs/specs/029-sheets/review.md "In the grid", "Who may do what"): Insert › Comment on a
// range opens a new thread's card beside it and Comment starts the thread, its top-left cell marked orange; resting on
// the cell shows its first comment; a Participant on a share link sees the marker, opens the card and replies, which
// the Editor sees live; the thread stays across a reload; Resolve takes the marker away for both.

const READY = '[data-spreadsheet-surface="ready"]';
const MARKER = '[data-sheet-comment-marker]';
const HOVER = '[data-sheet-comment-card]';
const CARD = '[data-sheet-thread-card]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

async function select(page: Page, range: string) {
  const nameBox = page.getByRole('textbox', { name: 'Name box' });
  await nameBox.fill(range);
  await nameBox.press('Enter');
}

// A cell's centre on the screen, from its drawn column and row headers.
async function cellCentre(page: Page, col: number, row: number) {
  const drawn = (role: string, axis: string, n: number) =>
    page.locator(`[role="${role}"][aria-${axis}index="${n}"]:not(.sr-only *)`).boundingBox();
  const letter = await drawn('columnheader', 'col', col);
  const number = await drawn('rowheader', 'row', row);
  return { x: letter!.x + letter!.width / 2, y: number!.y + number!.height / 2 };
}

test('a comment on cells is added, replied to by a Participant, and resolved', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=spreadsheet');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await select(page, 'B2');
  await page.keyboard.type('Revenue');
  await page.keyboard.press('Enter');

  // Insert › Comment on B2:C3 opens the new thread's card beside the range; Comment starts it.
  await select(page, 'B2:C3');
  await (await officeMenuItem(page, ['Insert', 'Comment'])).click();
  const draft = page.getByRole('group', { name: 'New comment' });
  await expect(draft.getByRole('textbox', { name: 'Add a comment' })).toBeFocused();
  await page.keyboard.type('Is this the final figure?');
  await page.screenshot({ path: test.info().outputPath('spreadsheet-comment-draft.png') });
  await draft.getByRole('button', { name: 'Comment' }).click();
  const card = page.locator(CARD);
  await expect(card.getByText('Is this the final figure?')).toBeVisible();
  await expect(page.getByRole('group', { name: /^Comment by .+ on B2:C3$/ })).toBeVisible();
  await expect(page.locator(MARKER)).toHaveCount(1);
  await expect(page.getByRole('gridcell', { name: 'B2 Revenue, has comment' })).toHaveCount(1);
  // The card stands right of the range.
  const c3 = await cellCentre(page, 3, 2);
  expect((await card.boundingBox())!.x).toBeGreaterThan(c3.x);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('spreadsheet-comment-thread.png') });

  // Escape lets the card go; resting on the cell shows the first comment.
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await select(page, 'E8');
  const b2 = await cellCentre(page, 2, 2);
  await page.mouse.move(b2.x, b2.y);
  await expect(page.locator(HOVER)).toContainText('Is this the final figure?');
  await page.screenshot({ path: test.info().outputPath('spreadsheet-comment-hover.png') });

  // A Participant on a share link sees the marker, opens the card on the cell and replies; the Editor sees it live.
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
  await expect(peer.locator(MARKER)).toHaveCount(1, { timeout: 15_000 });
  await select(peer, 'B2');
  const peerCard = peer.locator(CARD);
  await expect(peerCard.getByText('Is this the final figure?')).toBeVisible();
  await peerCard.getByRole('textbox', { name: 'Add a comment' }).fill('Yes, signed off.');
  await peerCard.getByRole('button', { name: 'Comment' }).click();
  await expect(peerCard.getByText('Yes, signed off.')).toBeVisible();
  // The Participant may edit only their own comment.
  await expect(peerCard.getByRole('button', { name: 'Edit comment' })).toHaveCount(1);
  await select(page, 'B2');
  await expect(card.getByText('Yes, signed off.')).toBeVisible({ timeout: 15_000 });

  // The thread stays across a reload.
  await page.reload();
  await expect(page.locator(READY)).toBeVisible();
  await expect(page.locator(MARKER)).toHaveCount(1);
  await select(page, 'B2');
  await expect(card.getByText('Yes, signed off.')).toBeVisible();

  // Resolve takes the marker away, for both.
  await card.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.locator(MARKER)).toHaveCount(0);
  await expect(card).toHaveCount(0);
  await expect(peer.locator(MARKER)).toHaveCount(0, { timeout: 15_000 });

  await ctx.close();
  expectNoPageErrors(pageErrors);
});
