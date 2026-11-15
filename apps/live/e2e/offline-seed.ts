// Writing This Browser documents into the page's offline store as the editor writes them
// (docs/specs/006-document/offline-mode.md "Where offline documents live"): each document's record
// without its tab bodies in `documents`, with its tab order as `tabIds`, and each tab in `tabs`,
// keyed by [documentId, tabId]. The page must be on the app's origin.
import type { Page } from '@playwright/test';

/** A document as the store's callers see it: its record with its tabs, in order. */
export type OfflineSeed = { id: string; tabs: { id: string; [field: string]: unknown }[] } & Record<
  string,
  unknown
>;

/** The database version the editor opens; the store is made here when this browser has none yet. */
export const OFFLINE_DB_VERSION = 3;

export async function seedOfflineDocuments(page: Page, docs: OfflineSeed[]): Promise<void> {
  await page.evaluate(
    ({ seeds, version }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('livedoc-offline', version);
        open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('documents')) {
            db.createObjectStore('documents', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('tabs')) db.createObjectStore('tabs');
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['documents', 'tabs'], 'readwrite');
          for (const { tabs, ...rest } of seeds) {
            tx.objectStore('documents').put({ ...rest, tabIds: tabs.map((t) => t.id) });
            for (const tab of tabs) tx.objectStore('tabs').put(tab, [rest.id, tab.id]);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        };
      }),
    { seeds: docs, version: OFFLINE_DB_VERSION },
  );
}
