import type { Locator, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Cards beside a story's text (docs/specs/034-text-documents/review.md "In a header, footer or note", "Going to a
// story's suggestion"): a header shown on three pages; a Participant suggests in it on page 3 and sees the card beside
// the page they edit on, while the Editor sees one card beside page 1's header. A suggestion in a note has its card
// beside the note. The comments panel's row of a header's suggestion opens the header; Accept and Reject settle them.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-suggestion-card]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
/** How far a card may sit from its text's line: the line's own height and the stack's padding. */
const LEVEL_PX = 40;

async function toSuggesting(page: Page) {
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
}

const topOf = async (locator: Locator) => (await locator.boundingBox())!.y;

test('a story’s suggestions have cards beside its text, and are gone to and settled', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  // Three pages, each showing the one header.
  await page.keyboard.type('Page one');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('Page two');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('Page three');
  await (await officeMenuItem(page, ['Insert', 'Headers & footers', 'Header'])).click();
  await expect(page.getByRole('textbox', { name: 'Header' })).toBeFocused();
  await page.keyboard.type('Running head');
  await page.keyboard.press('Escape');
  const copies = page.locator('[data-page-story="header"]');
  await expect(copies).toHaveCount(3);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-save-status', 'saved');

  // A Participant on a share link suggests in the header on page 3.
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
  await peer.getByText('Page three').click();
  await (await officeMenuItem(peer, ['Insert', 'Headers & footers', 'Header'])).click();
  const peerHeader = peer.getByRole('textbox', { name: 'Header' });
  await expect(peerHeader).toBeFocused();
  await peer.keyboard.press('End');
  await peer.keyboard.type(' draft');
  await expect(peerHeader.locator('.text-document-insertion')).toHaveText(' draft');

  // The writer's card is beside the page they edit on: page 3's header, far below page 1's.
  const peerCard = peer.locator(CARD).filter({ hasText: 'Add: “ draft”' });
  await expect(peerCard).toHaveCount(1);
  await expect(peerCard).toBeVisible();
  const peerCopies = peer.locator('[data-page-story="header"]');
  expect(Math.abs((await topOf(peerCard)) - (await topOf(peerHeader)))).toBeLessThan(LEVEL_PX);
  expect((await topOf(peerCard)) - (await topOf(peerCopies.first()))).toBeGreaterThan(500);
  await peer.waitForTimeout(300);
  await peer.screenshot({ path: test.info().outputPath('story-card-writer.png') });

  // Everyone else has one card, beside the first page's header.
  const card = page.locator(CARD).filter({ hasText: 'Add: “ draft”' });
  await expect(card).toHaveCount(1, { timeout: 15_000 });
  await page.getByText('Page one').scrollIntoViewIfNeeded();
  await expect(card).toBeVisible();
  expect(Math.abs((await topOf(card)) - (await topOf(copies.first())))).toBeLessThan(LEVEL_PX);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('story-card-reader.png') });

  // The Editor suggests a footnote on page 1: its note's writing has a card beside the note.
  await toSuggesting(page);
  await page.getByText('Page one').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Alt+KeyF');
  const note = page.locator('[data-page-notes-of="1"] [data-note-editing] [role="textbox"]');
  await expect(note).toBeFocused();
  await page.keyboard.type('The source');
  await page.keyboard.press('Escape');
  const noteCard = page.locator(CARD).filter({ hasText: 'Add: “The source”' });
  await expect(noteCard).toHaveCount(1);
  const drawnNote = page.locator('[data-page-notes-of="1"]').getByText('The source');
  expect(Math.abs((await topOf(noteCard)) - (await topOf(drawnNote)))).toBeLessThan(LEVEL_PX);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('story-card-note.png') });

  // The comments panel's row of the header's suggestion opens the header and selects its card.
  await body.click();
  await page.keyboard.press('Control+Alt+Shift+KeyA');
  const panel = page.getByRole('complementary', { name: 'Comments' });
  const row = panel
    .getByRole('listitem')
    .filter({ hasText: 'Add: “ draft”' })
    .getByRole('button', { name: /^Go to suggestion by / });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.locator('[data-editing-story="header"]')).toHaveCount(1);
  await expect(card).toHaveAttribute('aria-current', 'true');

  // Accepted, the header reads plain for both; the note's suggestion rejected takes its text away.
  await card.getByRole('button', { name: 'Accept suggestion' }).click();
  await expect(card).toHaveCount(0);
  await expect(peerCard).toHaveCount(0, { timeout: 15_000 });
  await expect(
    page.getByText('Running head draft').filter({ visible: true }).first(),
  ).toBeVisible();
  await noteCard.getByRole('button', { name: 'Reject suggestion' }).click();
  await expect(noteCard).toHaveCount(0);
  await expect(page.locator('[data-page-notes-of="1"]')).not.toContainText('The source');

  expectNoPageErrors(pageErrors);
  await ctx.close();
});
