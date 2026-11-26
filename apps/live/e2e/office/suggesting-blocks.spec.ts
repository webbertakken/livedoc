import type { Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Whole blocks while suggesting (docs/specs/034-text-documents/review.md "Whole blocks", "Inside a suggested block"):
// an Editor in Suggesting puts in a table, drawn inside an outline, and writes in it plainly; its card says "Add:
// Table". A Participant typing in that table suggests their own insertion, a card of its own (director, 2026-11-26).
// Rejecting the table takes it away with the Participant's writing. A section break and a table of contents put in
// while suggesting each have their card.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-suggestion-card]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

test.use({ colorScheme: 'dark' });

async function suggesting(page: Page) {
  // ⌘⌥⇧X (Ctrl+Alt+Shift+X here) switches to Suggesting.
  await page.keyboard.down('Control');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyX');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await page.keyboard.up('Control');
  await expect(page.getByRole('button', { name: 'Mode: Suggesting' })).toBeVisible();
}

async function insertTable(page: Page) {
  await page
    .getByRole('menubar', { name: 'Menu bar' })
    .getByRole('menuitem', { name: 'Insert' })
    .click();
  await page.getByRole('menuitem', { name: 'Table', exact: true }).hover();
  const grid = page.getByRole('menuitem', { name: /^Table, \d+ columns? by \d+ rows?$/ });
  await expect(grid).toBeVisible();
  await grid.locator('[data-size-cell="2x2"]').hover();
  await grid.locator('[data-size-cell="2x2"]').click();
}

test('whole blocks are suggested, written in plainly by their author, and as their own by others', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/new?kind=text-document');
  await expect(page.locator(READY)).toBeVisible();
  const body = page.locator(BODY);
  await body.click();
  await page.keyboard.type('Before');
  await suggesting(page);

  // A table: its card names it alone, it is drawn inside the author's outline, and the author writes in it plainly.
  await insertTable(page);
  const table = body.locator('table.text-document-table').first();
  await expect(table.locator('td')).toHaveCount(4);
  await expect(body.locator('.text-document-suggested-block-insertion')).toHaveCount(1);
  const tableCard = page.locator(CARD).filter({ hasText: 'Add: Table' });
  await expect(tableCard).toHaveCount(1);
  await page.keyboard.type('mine');
  await expect(table.locator('td').first()).toHaveText('mine');
  await expect(table.locator('.text-document-insertion')).toHaveCount(0);
  await expect(page.locator(CARD)).toHaveCount(1);

  // A Participant on a share link types in that table: their own insertion, a card of its own for the Editor.
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
  const peerTable = peer.locator(BODY).locator('table.text-document-table').first();
  await expect(peerTable.locator('td').first()).toHaveText('mine', { timeout: 15_000 });
  await peerTable.locator('td').nth(1).click();
  await peer.keyboard.type('theirs');
  const theirCard = page.locator(CARD).filter({ hasText: 'Add: “theirs”' });
  await expect(theirCard).toHaveCount(1, { timeout: 15_000 });
  await expect(table.locator('.text-document-insertion')).toHaveText('theirs');
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-blocks-table.png') });

  // Rejecting the table takes it away, the Participant's writing with it.
  await tableCard.click();
  await tableCard.getByRole('button', { name: 'Reject suggestion' }).click();
  await expect(body.locator('table.text-document-table')).toHaveCount(0);
  await expect(theirCard).toHaveCount(0);
  await expect(peer.locator(BODY).locator('table.text-document-table')).toHaveCount(0, {
    timeout: 15_000,
  });
  await ctx.close();

  // A section break and a table of contents, each with its card.
  await body.locator(':scope > p').first().click();
  await page.keyboard.press('End');
  await (await officeMenuItem(page, ['Insert', 'Break', 'Section break (next page)'])).click();
  await expect(page.locator(CARD).filter({ hasText: 'Add: Section break' })).toHaveCount(1);
  await body.locator(':scope > p').first().click();
  await page.keyboard.press('Home');
  await (await officeMenuItem(page, ['Insert', 'Table of contents', 'Plain text'])).click();
  await expect(page.locator(CARD).filter({ hasText: 'Add: Table of contents' })).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-blocks-breaks.png') });
  expectNoPageErrors(pageErrors);
});
