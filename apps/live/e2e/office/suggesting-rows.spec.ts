import type { Locator, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { officeMenuItem } from './office-menus';

// Rows and columns while suggesting (docs/specs/034-text-documents/review.md "Rows and columns", "Not yet", "Suggestion
// cards"): an Editor in Suggesting adds a row ("Add: Row") and deletes a column ("Delete: Column", its cells struck
// through, staying); a column added grows the table, Reject gives it back as it was and Accept fits it to the text
// (director, 2026-11-26); a column a merged cell crosses is not yet; a Participant's row reaches the Editor, who
// accepts it.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const CARD = '[data-suggestion-card]';
const NOT_YET = 'This can’t be suggested yet.';
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

const widthOf = async (table: Locator) => (await table.boundingBox())!.width;

async function settle(page: Page, line: string, verb: 'Accept' | 'Reject') {
  const card = page.locator(CARD).filter({ hasText: line });
  await card.click();
  await card.getByRole('button', { name: `${verb} suggestion` }).click();
  await expect(card).toHaveCount(0);
}

test('rows and columns are suggested, settled, fitted, and refused where a merged cell crosses', async ({
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

  // In Editing: a table whose first row is merged across, then a plain table at the text's width.
  await insertTable(page);
  const merged = body.locator('table.text-document-table').first();
  await page.keyboard.type('wide');
  await page.keyboard.press('Tab');
  await page.keyboard.type('w2');
  await merged.locator('td', { hasText: 'wide' }).click();
  await merged.locator('td', { hasText: 'w2' }).click({ modifiers: ['Shift'] });
  await merged.locator('td', { hasText: 'w2' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Merge cells' }).click();
  await expect(merged.locator('td[colspan="2"]')).toHaveCount(1);
  await body.locator(':scope > p').last().click();
  await page.keyboard.press('End');
  await insertTable(page);
  const table = body.locator('table.text-document-table').nth(1);
  for (const [i, text] of ['a1', 'b1', 'a2', 'b2'].entries()) {
    if (i > 0) await page.keyboard.press('Tab');
    await page.keyboard.type(text);
  }
  const fullWidth = await widthOf(table);
  await suggesting(page);
  const cell = (text: string) => table.locator('td', { hasText: text });

  // A column a merged cell crosses: not yet.
  await tableItem(page, merged.locator('td').nth(1), 'Insert column right');
  await expect(page.getByText(NOT_YET)).toBeVisible();
  await expect(merged.locator('tr').nth(1).locator('td')).toHaveCount(2);

  // A row added: its card, its cells outlined.
  await tableItem(page, cell('a1'), 'Insert row below');
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(page.locator(CARD).filter({ hasText: 'Add: Row' })).toHaveCount(1);
  await expect(table.locator('.text-document-suggested-block-insertion')).toHaveCount(2);

  // A column deleted: it stays, its cells struck through.
  await tableItem(page, cell('b1'), 'Delete column');
  await expect(table.locator('tr').first().locator('td')).toHaveCount(2);
  await expect(page.locator(CARD).filter({ hasText: 'Delete: Column' })).toHaveCount(1);
  await expect(table.locator('.text-document-suggested-block-deletion')).toHaveCount(3);
  await page.waitForTimeout(300);
  await table.screenshot({ path: test.info().outputPath('suggesting-rows-row-and-column.png') });
  await page.screenshot({ path: test.info().outputPath('suggesting-rows-cards.png') });
  await settle(page, 'Delete: Column', 'Reject');
  await settle(page, 'Add: Row', 'Reject');
  await expect(table.locator('tr')).toHaveCount(2);
  await expect(table.locator('.text-document-suggested-block')).toHaveCount(0);

  // A column added grows the table; Reject gives it back as it was.
  await tableItem(page, cell('b1'), 'Insert column right');
  await expect(page.locator(CARD).filter({ hasText: 'Add: Column' })).toHaveCount(1);
  expect(await widthOf(table)).toBeGreaterThan(fullWidth + 20);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath('suggesting-rows-column.png') });
  await settle(page, 'Add: Column', 'Reject');
  await expect(table.locator('tr').first().locator('td')).toHaveCount(2);
  expect(Math.abs((await widthOf(table)) - fullWidth)).toBeLessThan(2);

  // Accepted, it is fitted to the text's width.
  await tableItem(page, cell('b1'), 'Insert column right');
  await settle(page, 'Add: Column', 'Accept');
  await expect(table.locator('tr').first().locator('td')).toHaveCount(3);
  await expect
    .poll(async () => Math.abs((await widthOf(table)) - fullWidth), { timeout: 5_000 })
    .toBeLessThan(2);

  // A Participant adds a row: the Editor sees its card and accepts it.
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
  const peerTable = peer.locator(BODY).locator('table.text-document-table').nth(1);
  await expect(peerTable.locator('td', { hasText: 'a2' })).toBeVisible({ timeout: 15_000 });
  await tableItem(peer, peerTable.locator('td', { hasText: 'a2' }), 'Insert row below');
  await expect(page.locator(CARD).filter({ hasText: 'Add: Row' })).toHaveCount(1, {
    timeout: 15_000,
  });
  await settle(page, 'Add: Row', 'Accept');
  await expect(table.locator('tr')).toHaveCount(3);
  await expect(peerTable.locator('tr')).toHaveCount(3, { timeout: 15_000 });
  await expect(peer.locator(CARD)).toHaveCount(0, { timeout: 15_000 });
  await ctx.close();
  expectNoPageErrors(pageErrors);
});
