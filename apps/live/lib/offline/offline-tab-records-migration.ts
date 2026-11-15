// Version 3 of the offline store (docs/specs/006-document/offline-mode.md "Tab records"): every
// document still holding its tabs inline moves to one record per tab. Runs inside the version-change
// transaction, so it is all or nothing: a throw or an abort leaves the database at its old version,
// every document as it was.

import type { Tab } from '@livedoc/document';
import {
  DOCUMENTS_STORE,
  TABS_STORE,
  documentTabsRange,
  isWholeRecord,
  metaOf,
  splitsLosslessly,
  tabKey,
  type StoredOfflineDocument,
} from './offline-tab-records';

// Why the migration gave up; the transaction is aborted with it.
export class OfflineMigrationError extends Error {
  constructor(reason: string) {
    super(`offline store migration failed: ${reason}`);
    this.name = 'OfflineMigrationError';
  }
}

// A tab read back is the tab that was written: the same JSON, field for field and in order.
export function sameTab(written: Tab, readBack: Tab | undefined): boolean {
  return readBack !== undefined && JSON.stringify(readBack) === JSON.stringify(written);
}

export type MigrationOutcome = { moved: number; keptWhole: number };

// Creates the `tabs` store when missing, then moves each whole document: its tab records written and
// read back, and only then the document replaced by its meta. A document already in tab records is
// left alone, so a second run changes nothing. `done` is called once every document has been seen;
// `fail` with the reason when a tab does not read back the same, after the transaction is aborted.
export function migrateToTabRecords(
  db: IDBDatabase,
  tx: IDBTransaction,
  done: (outcome: MigrationOutcome) => void,
  fail: (err: OfflineMigrationError) => void,
): void {
  if (!db.objectStoreNames.contains(TABS_STORE)) db.createObjectStore(TABS_STORE);
  const documents = tx.objectStore(DOCUMENTS_STORE);
  const tabs = tx.objectStore(TABS_STORE);
  const outcome: MigrationOutcome = { moved: 0, keptWhole: 0 };
  const cursorRequest = documents.openCursor();
  const abortWith = (reason: string) => {
    tx.abort();
    fail(new OfflineMigrationError(reason));
  };
  // A throw in a step (a put the browser refuses) aborts with its reason instead of escaping the handler.
  const guarded = (step: () => void) => () => {
    try {
      step();
    } catch (err) {
      abortWith(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
  };
  cursorRequest.onsuccess = guarded(() => {
    const cursor = cursorRequest.result;
    if (!cursor) return done(outcome);
    const stored = cursor.value as StoredOfflineDocument;
    if (!isWholeRecord(stored)) return cursor.continue();
    if (!splitsLosslessly(stored)) {
      outcome.keptWhole++;
      console.warn('[offline-store] migration-kept-whole', { documentId: stored.id });
      return cursor.continue();
    }
    // Tab records no inline tab names (none, unless a write was cut short) are not part of the document.
    tabs.delete(documentTabsRange(stored.id));
    for (const tab of stored.tabs) tabs.put(tab, tabKey(stored.id, tab.id));
    const checks = stored.tabs.map(
      (tab) => tabs.get(tabKey(stored.id, tab.id)) as IDBRequest<Tab | undefined>,
    );
    const afterChecks = guarded(() => {
      const bad = stored.tabs.findIndex((tab, i) => !sameTab(tab, checks[i]!.result));
      if (bad !== -1) {
        abortWith(`tab ${stored.tabs[bad]!.id} of ${stored.id} did not read back the same`);
        return;
      }
      cursor.update(metaOf(stored));
      outcome.moved++;
      cursor.continue();
    });
    // Requests on one transaction complete in order: the last check landing means all have.
    if (checks.length === 0) afterChecks();
    else checks[checks.length - 1]!.onsuccess = afterChecks;
  });
}
