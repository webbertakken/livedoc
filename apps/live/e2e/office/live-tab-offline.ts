import type { Browser } from '@playwright/test';

// What the offline specs of the live tab kinds share (docs/specs/006-document/kinds-outside-the-canvas.md "Live
// state"): a browser that can lose its connection, and a count of the local copies it keeps.

/** A context that can go offline: its network gone, and every socket to the room closed, also as one opens. */
export async function cuttableContext(browser: Browser, baseURL: string) {
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

/** How many local copies this browser keeps in `database`, a kind's own; run in the page. */
export function copiesKept(database: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database);
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
