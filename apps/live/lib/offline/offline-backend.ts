// Offline Mode's storage backend (docs/specs/006-document/offline-mode.md "Where offline documents
// live"): whole documents in and out, behind a small interface so tests swap in an in-memory map. The
// IndexedDB one keeps each tab in its own record (./offline-tab-records) and writes back only what a
// change touched; a database whose upgrade failed is read and written in its own shape, whole records
// (./offline-db). The record shape and every operation on it live in ./offline-store.ts.

import type { Tab } from '@livedoc/document';
import { openOfflineDb } from './offline-db';
import {
  DOCUMENTS_STORE,
  TABS_STORE,
  deleteDocument,
  metaOf,
  readAllDocuments,
  readDocument,
  updateTab,
  withTab,
  writeDocument,
  type Guard,
  type OfflineTabChange,
} from './offline-tab-records';
import type { OfflineDocumentRecord } from './offline-store';

export {
  OFFLINE_STORE_OPEN_TIMEOUT_MS,
  OFFLINE_STORE_UPGRADE_TIMEOUT_MS,
  OfflineStoreSupersededError,
  OfflineStoreUnavailableError,
} from './offline-db';
export type { OfflineDocumentMeta, OfflineTabChange } from './offline-tab-records';

// What a read-modify-write gets: the stored record (undefined when there is none), and what it
// answers: the record to store, 'delete' to remove it, or undefined to write nothing. Synchronous, because IndexedDB
// commits a transaction the moment it is left with no pending request; a throw writes nothing
// and rejects the update with the thrown error.
export type OfflineRecordChange = (
  rec: OfflineDocumentRecord | undefined,
) => OfflineDocumentRecord | 'delete' | undefined;

export type OfflineBackend = {
  get(id: string): Promise<OfflineDocumentRecord | undefined>;
  put(rec: OfflineDocumentRecord): Promise<void>;
  delete(id: string): Promise<void>;
  all(): Promise<OfflineDocumentRecord[]>;
  // The read and the write in ONE transaction, so another browser tab's write cannot land between
  // them and be overwritten (two transactions let it: the module's write chain only orders this tab).
  update(id: string, change: OfflineRecordChange): Promise<void>;
  // The autosave's read-modify-write: the document meta and one tab, in one transaction, the other
  // tabs neither read nor written. Same rules as `update`.
  updateTab(id: string, tabId: string, change: OfflineTabChange): Promise<void>;
};

// One transaction over the stores the open database has. `body` issues its requests and may `answer`
// a value; the promise settles when the transaction commits, so a resolved write is on disk. A throw
// in a guarded step aborts the transaction and rejects with the thrown error.
async function transact<T>(
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction, split: boolean, guard: Guard, answer: (value: T) => void) => void,
): Promise<T> {
  const db = await openOfflineDb();
  try {
    const split = db.objectStoreNames.contains(TABS_STORE);
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(split ? [DOCUMENTS_STORE, TABS_STORE] : [DOCUMENTS_STORE], mode);
      let thrown: { err: unknown } | null = null;
      let value: T;
      const guard: Guard =
        (step) =>
        (...args) => {
          try {
            step(...args);
          } catch (err) {
            thrown = { err };
            tx.abort();
          }
        };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () =>
        reject(thrown ? thrown.err : (tx.error ?? new Error('IndexedDB transaction aborted')));
      guard(() =>
        body(tx, split, guard, (v) => {
          value = v;
        }),
      )();
    });
  } finally {
    db.close();
  }
}

// A database whose upgrade failed holds whole records in `documents`.
function wholeStore(tx: IDBTransaction): IDBObjectStore {
  return tx.objectStore(DOCUMENTS_STORE);
}

function readWhole(
  tx: IDBTransaction,
  id: string,
  done: (rec: OfflineDocumentRecord | undefined) => void,
): void {
  const read = wholeStore(tx).get(id) as IDBRequest<OfflineDocumentRecord | undefined>;
  read.onsuccess = () => done(read.result);
}

const indexedDbBackend: OfflineBackend = {
  get: (id) =>
    transact<OfflineDocumentRecord | undefined>('readonly', (tx, split, guard, answer) => {
      if (split)
        readDocument(
          tx,
          id,
          guard((rec) => answer(rec)),
        );
      else readWhole(tx, id, guard(answer));
    }),
  put: (rec) =>
    transact<void>('readwrite', (tx, split) => {
      if (split) writeDocument(tx, rec);
      else wholeStore(tx).put(rec);
    }),
  delete: (id) =>
    transact<void>('readwrite', (tx, split) => {
      if (split) deleteDocument(tx, id);
      else wholeStore(tx).delete(id);
    }),
  all: () =>
    transact<OfflineDocumentRecord[]>('readonly', (tx, split, guard, answer) => {
      if (split) return readAllDocuments(tx, guard(answer));
      const read = wholeStore(tx).getAll() as IDBRequest<OfflineDocumentRecord[]>;
      read.onsuccess = guard(() => answer(read.result));
    }),
  update: (id, change) =>
    transact<void>('readwrite', (tx, split, guard) => {
      if (!split) {
        return readWhole(
          tx,
          id,
          guard((rec) => {
            const next = change(rec);
            if (next === 'delete') wholeStore(tx).delete(id);
            else if (next) wholeStore(tx).put(next);
          }),
        );
      }
      readDocument(
        tx,
        id,
        guard((rec, stored) => {
          const next = change(rec);
          if (next === 'delete') deleteDocument(tx, id);
          else if (next) writeDocument(tx, next, rec && stored ? { rec, stored } : undefined);
        }),
      );
    }),
  updateTab: (id, tabId, change) =>
    transact<void>('readwrite', (tx, split, guard) => {
      if (split) return updateTab(tx, id, tabId, change, guard);
      readWhole(
        tx,
        id,
        guard((rec) => {
          const answer = rec
            ? change(
                metaOf(rec),
                rec.tabs.find((t: Tab) => t.id === tabId),
              )
            : change(undefined, undefined);
          if (rec && answer) wholeStore(tx).put(withTab(rec, answer));
        }),
      );
    }),
};

let backend: OfflineBackend = indexedDbBackend;

// The current backend, for the offline modules, which read and rewrite whole records.
export function offlineBackend(): OfflineBackend {
  return backend;
}

// Test seam behind ./offline-store's __setOfflineBackend, which also resets the id cache.
export function setOfflineBackend(b: OfflineBackend | null): void {
  backend = b ?? indexedDbBackend;
}
