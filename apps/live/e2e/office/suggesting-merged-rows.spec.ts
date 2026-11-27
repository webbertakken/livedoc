import type { Locator, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Rows across merged cells while suggesting (docs/specs/034-text-documents/review.md "Across merged cells"): an Editor's
// row put in through a merged cell grows it, Reject shrinks it back; a Participant's does too, the room keeping it and
// the Editor accepting it; a row a merged cell crosses suggested deleted leaves the merged cell until Accept, which
// takes the row away and shrinks it.

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

async function tableItem(page: Page, cell: Locator, item: string) {
  await cell.click();
  await (await officeMenuItem(page, ['Format', 'Table', item])).click();
}

async function settle(page: Page, line: string, verb: 'Accept' | 'Reject') {
  const card = page.locator(CARD).filter({ hasText: line });
  await card.click();
  await card.getByRole('button', { name: `${verb} suggestion` }).click();
  await expect(card).toHaveCount(0);
}

test('rows put in and deleted through a merged cell grow it, keep it and shrink it', async ({
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
  await page.keyboard.type('Before');

  // In Editing: a 2 × 2 table whose first column is one cell, merged down.
  await insertTable(page);
  const table = body.locator('table.text-document-table').first();
  for (const [i, text] of ['a1', 'b1', 'a2', 'b2'].entries()) {
    if (i > 0) await page.keyboard.press('Tab');
    await page.keyboard.type(text);
  }
  const cell = (text: string) => table.locator('td', { hasText: text });
  await cell('a1').click();
  await cell('a2').click({ modifiers: ['Shift'] });
  await cell('a2').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Merge cells' }).click();
  const tall = table.locator('td[rowspan]');
  await expect(tall).toHaveAttribute('rowspan', '2');
  await suggesting(page);

  // A row put in through it grows it; Reject shrinks it back.
  await tableItem(page, cell('b1'), 'Insert row below');
  await expect(tall).toHaveAttribute('rowspan', '3');
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(page.locator(CARD).filter({ hasText: 'Add: Row' })).toHaveCount(1);
  await page.waitForTimeout(300);
  await table.screenshot({ path: test.info().outputPath('suggesting-merged-row.png') });
  await settle(page, 'Add: Row', 'Reject');
  await expect(tall).toHaveAttribute('rowspan', '2');
  await expect(table.locator('tr')).toHaveCount(2);

  // A Participant's row through it: the room keeps it, the Editor accepts it.
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
  await expect(peerTable.locator('td', { hasText: 'b1' })).toBeVisible({ timeout: 15_000 });
  await tableItem(peer, peerTable.locator('td', { hasText: 'b1' }), 'Insert row below');
  await expect(page.locator(CARD).filter({ hasText: 'Add: Row' })).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(tall).toHaveAttribute('rowspan', '3');
  await settle(page, 'Add: Row', 'Accept');
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(peerTable.locator('td[rowspan]')).toHaveAttribute('rowspan', '3', {
    timeout: 15_000,
  });
  await ctx.close();

  // A row it crosses suggested deleted: struck through, the merged cell staying; Accept takes it and shrinks it.
  await tableItem(page, cell('b2'), 'Delete row');
  await expect(page.locator(CARD).filter({ hasText: 'Delete: Row' })).toHaveCount(1);
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(tall).toHaveAttribute('rowspan', '3');
  await page.waitForTimeout(300);
  await table.screenshot({ path: test.info().outputPath('suggesting-merged-delete.png') });
  await settle(page, 'Delete: Row', 'Accept');
  await expect(table.locator('tr')).toHaveCount(2);
  await expect(tall).toHaveAttribute('rowspan', '2');
  await expect(cell('b2')).toHaveCount(0);
  expectNoPageErrors(pageErrors);
});
