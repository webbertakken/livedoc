import type { Browser, BrowserContext, Page } from '@playwright/test';
import { expect, expectNoPageErrors, pageOwnerHeaders, test } from '../fixtures';

// A text document across a lost connection (docs/specs/034-text-documents/live-editing-and-storage.md "Reconnecting",
// "The local copy"): what one person types while their room is down reaches everyone once it is back, and what they
// typed before closing the tab offline arrives when they open it again. Nothing typed on either side is lost.

const BODY = '[role="textbox"][aria-label="Document body"]';
const READY = '[data-text-document-surface="ready"]';
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

/** A context that can go offline: its network gone, and every socket to the room closed, also as one opens. */
async function cuttableContext(browser: Browser, baseURL: string) {
  const ctx = await browser.newContext({
    baseURL,
    colorScheme: 'dark',
    viewport: { width: 1280, height: 860 },
  });
  const link = { down: false, cut: async () => {}, restore: async () => {} };
  const sockets = new Set<{ close: () => Promise<void> }>();
  await ctx.routeWebSocket(/\/documents\/[^/]+\/ws/, (ws) => {
    if (link.down) {
      void ws.close();
      return;
    }
    ws.connectToServer();
    sockets.add(ws);
    ws.onClose(() => sockets.delete(ws));
  });
  link.cut = async () => {
    link.down = true;
    await ctx.setOffline(true);
    for (const ws of sockets) await ws.close();
  };
  link.restore = async () => {
    link.down = false;
    await ctx.setOffline(false);
  };
  return { ctx, link };
}

// How many local copies this browser keeps (live-editing-and-storage.md "The local copy").
function copiesKept(): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('livedoc-text-documents');
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('copies')) {
        db.close();
        resolve(0);
        return;
      }
      const count = db.transaction('copies').objectStore('copies').count();
      count.onsuccess = () => {
        db.close();
        resolve(count.result);
      };
      count.onerror = () => reject(count.error ?? new Error('count failed'));
    };
    request.onerror = () => reject(request.error ?? new Error('open failed'));
  });
}

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

  // Back: the peer's room opens again by itself and both catch up, by character.
  await link.restore();
  const both = `${offline}Agenda. Owner online.`;
  await expect(page.locator(BODY)).toHaveText(both, { timeout: 45_000 });
  await expect(peer.locator(BODY)).toHaveText(both);
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
  await expect.poll(() => peer.evaluate(copiesKept)).toBe(1);
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
