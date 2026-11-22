import type { BrowserContext, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';
import { copiesKept, cuttableContext } from './live-tab-offline';

// A text document across a lost connection (docs/specs/034-text-documents/live-editing-and-storage.md "Reconnecting",
// "The local copy"): what one person types while their room is down reaches everyone once it is back, and what they
// typed before closing the tab offline arrives when they open it again. Nothing typed on either side is lost.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';
// The database a text document's local copies are kept in.
const COPIES = 'livedoc-text-documents';

async function joinShared(ctx: BrowserContext, code: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`/document/shared?s=${code}`);
  // A visitor joins under a name when the welcome asks for one; the body shows either way.
  const join = page.getByRole('button', { name: /^join$/i });
  await expect(join.or(page.locator(BODY))).toBeVisible();
  if (await join.isVisible()) await join.click();
  await expect(page.locator(READY)).toBeVisible();
  return page;
}

async function sharedTextDocument(page: Page, baseURL: string): Promise<string> {
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto('/new?kind=text-document');
  await page.waitForURL(/\/document\//);
  await expect(page.locator(READY)).toBeVisible();
  await page.locator(BODY).click();
  await page.keyboard.type('Agenda.');
  const id = new URL(page.url()).pathname.split('/')[2]!;
  const headers = await pageOwnerHeaders(page, { Origin: new URL(baseURL).origin });
  const share = await page.request.post(`${apiBase}/documents/${id}/share`, {
    headers,
    data: { role: 'edit' },
  });
  return ((await share.json()) as { link: { code: string } }).link.code;
}

test('what is typed while the room is down reaches everyone once it is back', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  const code = await sharedTextDocument(page, baseURL!);
  const { ctx, link } = await cuttableContext(browser, baseURL!);
  const peer = await joinShared(ctx, code);
  await expect(peer.locator(BODY)).toHaveText('Agenda.');
  // The save status (editing-surface.md "The title row"): saved while the room holds everything.
  const status = peer.locator('[data-save-status]');
  await expect(status).toHaveAttribute('data-save-status', 'saved');

  // The peer's room goes down; both keep typing, the owner at the end and the peer at the start, the peer for longer
  // than the room connection would hold for it (OUTBOX_MAX keystrokes).
  const offline = 'Offline first. '.repeat(40);
  await link.cut();
  await peer.locator(BODY).click();
  await peer.keyboard.press('Home');
  await peer.keyboard.type(offline);
  await page.keyboard.type(' Owner online.');
  await expect(page.locator(BODY)).toHaveText('Agenda. Owner online.');
  await expect(peer.locator(BODY)).toHaveText(`${offline}Agenda.`);
  await expect(status).toHaveAttribute('data-save-status', 'offline');
  await expect(status).toHaveText('Offline: changes are kept in this browser');
  await peer.screenshot({ path: test.info().outputPath('save-status-offline.png') });

  // Back: the peer's room opens again by itself and both catch up, by character.
  await link.restore();
  const both = `${offline}Agenda. Owner online.`;
  await expect(page.locator(BODY)).toHaveText(both, { timeout: 45_000 });
  await expect(peer.locator(BODY)).toHaveText(both);
  await expect(status).toHaveAttribute('data-save-status', 'saved');
  await ctx.close();
  expectNoPageErrors(pageErrors);
});

test('what is typed before closing the tab offline arrives when it is opened again', async ({
  page,
  browser,
  baseURL,
  pageErrors,
}) => {
  test.setTimeout(120_000);
  const code = await sharedTextDocument(page, baseURL!);
  const { ctx, link } = await cuttableContext(browser, baseURL!);
  const peer = await joinShared(ctx, code);
  await expect(peer.locator(BODY)).toHaveText('Agenda.');

  await link.cut();
  await peer.locator(BODY).click();
  await peer.keyboard.press('End');
  await peer.keyboard.type(' Kept in this browser.');
  // The browser keeps what the room has not confirmed; closed before the room ever heard it, only that copy holds it.
  await expect.poll(() => peer.evaluate(copiesKept, COPIES)).toBe(1);
  await peer.close({ runBeforeUnload: true });
  await expect(page.locator(BODY)).toHaveText('Agenda.');

  // Opened again with the room reachable: the copy merges and goes to everyone.
  await link.restore();
  const again = await joinShared(ctx, code);
  const typed = 'Agenda. Kept in this browser.';
  await expect(again.locator(BODY)).toHaveText(typed);
  await expect(page.locator(BODY)).toHaveText(typed, { timeout: 30_000 });
  await ctx.close();
  expectNoPageErrors(pageErrors);
});
