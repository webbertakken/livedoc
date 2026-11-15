// Offline Mode's storage layout (docs/specs/006-document/offline-mode.md "Where offline documents
// live"): one record per tab in `tabs`, keyed by [documentId, tabId], beside one record per document
// in `documents` holding everything else and the tab order (`tabIds`). Callers above the backend see
// whole documents; this module assembles them and writes back only what a change touched, so an
// autosave writes the one tab it saves.
//
// Everything here runs inside a transaction the caller owns, in callback style: IndexedDB commits a
// transaction the moment it is left with no pending request, so every step is chained on the
// previous request's success.

import type { Tab } from '@livedoc/document';
import type { OfflineDocumentRecord } from './offline-store';

export const DOCUMENTS_STORE = 'documents';
export const TABS_STORE = 'tabs';

// A document's record without its tab bodies: what `documents` holds once a document is in tab records.
export type OfflineDocumentMeta = Omit<OfflineDocumentRecord, 'tabs'> & { tabIds: string[] };

// What `documents` may hold: a document in tab records, or one still whole (from before version 3,
// kept whole by the migration, or written by a page whose upgrade failed).
export type StoredOfflineDocument = OfflineDocumentMeta | OfflineDocumentRecord;

export type TabKey = [documentId: string, tabId: string];

export const tabKey = (documentId: string, tabId: string): TabKey => [documentId, tabId];

// Every tab record of one document: array keys sort after strings, so [id, []] bounds every [id, tabId].
export const documentTabsRange = (documentId: string): IDBKeyRange =>
  IDBKeyRange.bound([documentId], [documentId, []]);

export function isWholeRecord(stored: StoredOfflineDocument): stored is OfflineDocumentRecord {
  return Array.isArray((stored as OfflineDocumentRecord).tabs);
}

// A document splits into tab records without losing a tab only when every tab has its own string id.
export function splitsLosslessly(rec: OfflineDocumentRecord): boolean {
  const ids = rec.tabs.map((t) => t?.id);
  return ids.every((id) => typeof id === 'string') && new Set(ids).size === ids.length;
}

export function metaOf(rec: OfflineDocumentRecord): OfflineDocumentMeta {
  const { tabs, ...rest } = rec;
  return { ...rest, tabIds: tabs.map((t) => t.id) };
}

// The whole document from its meta and tab bodies, in `tabIds` order. A listed tab without a body is
// left out, logged, rather than failing the read of every other tab.
export function assemble(
  meta: OfflineDocumentMeta,
  bodies: ReadonlyMap<string, Tab>,
): OfflineDocumentRecord {
  const { tabIds, ...rest } = meta;
  const tabs: Tab[] = [];
  for (const tabId of tabIds) {
    const tab = bodies.get(tabId);
    if (tab) tabs.push(tab);
    else console.warn('[offline-store] tab-record-missing', { documentId: meta.id, tabId });
  }
  return { ...rest, tabs };
}

// Read one document whole, inside `tx` (both stores). `done` gets undefined when there is none, and the
// stored shape so a write can tell which tab records already hold what.
export function readDocument(
  tx: IDBTransaction,
  id: string,
  done: (rec: OfflineDocumentRecord | undefined, stored: StoredOfflineDocument | undefined) => void,
): void {
  const read = tx.objectStore(DOCUMENTS_STORE).get(id) as IDBRequest<
    StoredOfflineDocument | undefined
  >;
  read.onsuccess = () => {
    const stored = read.result;
    if (!stored) return done(undefined, undefined);
    if (isWholeRecord(stored)) return done(stored, stored);
    const bodies = tx.objectStore(TABS_STORE).getAll(documentTabsRange(id)) as IDBRequest<Tab[]>;
    bodies.onsuccess = () =>
      done(assemble(stored, new Map(bodies.result.map((t) => [t.id, t] as const))), stored);
  };
}

// Every document whole, inside `tx`. Keys and values of one store come back in the same key order.
export function readAllDocuments(
  tx: IDBTransaction,
  done: (recs: OfflineDocumentRecord[]) => void,
): void {
  const docs = tx.objectStore(DOCUMENTS_STORE).getAll() as IDBRequest<StoredOfflineDocument[]>;
  const tabs = tx.objectStore(TABS_STORE);
  const keys = tabs.getAllKeys();
  const bodies = tabs.getAll() as IDBRequest<Tab[]>;
  bodies.onsuccess = () => {
    const byDocument = new Map<string, Map<string, Tab>>();
    keys.result.forEach((key, i) => {
      const [documentId, tabId] = key as TabKey;
      const own = byDocument.get(documentId) ?? new Map<string, Tab>();
      own.set(tabId, bodies.result[i]!);
      byDocument.set(documentId, own);
    });
    done(
      docs.result.map((stored) =>
        isWholeRecord(stored) ? stored : assemble(stored, byDocument.get(stored.id) ?? new Map()),
      ),
    );
  };
}

// Store `next` as tab records, inside `tx`. `previous` is what `readDocument` read in the same
// transaction: a tab object it already held in a tab record is not written again (the store's
// transforms keep an untouched tab the same object), the meta only when one of its fields changed.
// A document not yet in tab records (a put, or one still whole) has every tab written, after any stray
// tab records of its id are removed.
export function writeDocument(
  tx: IDBTransaction,
  next: OfflineDocumentRecord,
  previous?: { rec: OfflineDocumentRecord; stored: StoredOfflineDocument },
): void {
  const tabs = tx.objectStore(TABS_STORE);
  const meta = metaOf(next);
  const split = previous && !isWholeRecord(previous.stored) ? previous : undefined;
  if (!split) tabs.delete(documentTabsRange(next.id));
  const held = new Map((split?.rec.tabs ?? []).map((t) => [t.id, t] as const));
  for (const tab of next.tabs) {
    if (held.get(tab.id) !== tab) tabs.put(tab, tabKey(next.id, tab.id));
  }
  if (previous) {
    const kept = new Set(meta.tabIds);
    for (const tab of previous.rec.tabs)
      if (!kept.has(tab.id)) tabs.delete(tabKey(next.id, tab.id));
  }
  if (!split || metaChanged(split.stored as OfflineDocumentMeta, meta)) {
    tx.objectStore(DOCUMENTS_STORE).put(meta);
  }
}

export function deleteDocument(tx: IDBTransaction, id: string): void {
  tx.objectStore(DOCUMENTS_STORE).delete(id);
  tx.objectStore(TABS_STORE).delete(documentTabsRange(id));
}

// A field compared by identity (the transforms spread a record, so an untouched field keeps its value),
// and the tab order by its ids.
function metaChanged(before: OfflineDocumentMeta, after: OfflineDocumentMeta): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('tabIds');
  for (const key of keys) {
    if (before[key as keyof OfflineDocumentMeta] !== after[key as keyof OfflineDocumentMeta])
      return true;
  }
  return (
    before.tabIds.length !== after.tabIds.length ||
    before.tabIds.some((tabId, i) => tabId !== after.tabIds[i])
  );
}

// What an autosave changes: the document meta and the one tab, given as stored (undefined when absent).
// Answers both to store, or undefined to write nothing.
export type OfflineTabChange = (
  meta: OfflineDocumentMeta | undefined,
  tab: Tab | undefined,
) => { meta: OfflineDocumentMeta; tab: Tab } | undefined;

// Wraps a step so a throw in it aborts the transaction and rejects the caller with the thrown error.
export type Guard = <A extends unknown[]>(step: (...args: A) => void) => (...args: A) => void;

// Read and write one tab and its document meta, inside `tx`, never touching the other tabs. A document
// still whole is read whole and stored as tab records, the one time it is written in full.
export function updateTab(
  tx: IDBTransaction,
  id: string,
  tabId: string,
  change: OfflineTabChange,
  guard: Guard,
): void {
  const read = tx.objectStore(DOCUMENTS_STORE).get(id) as IDBRequest<
    StoredOfflineDocument | undefined
  >;
  read.onsuccess = guard(() => {
    const stored = read.result;
    if (!stored) {
      change(undefined, undefined);
      return;
    }
    if (isWholeRecord(stored)) {
      const answer = change(
        metaOf(stored),
        stored.tabs.find((t) => t.id === tabId),
      );
      if (answer) writeDocument(tx, withTab(stored, answer), { rec: stored, stored });
      return;
    }
    const body = tx.objectStore(TABS_STORE).get(tabKey(id, tabId)) as IDBRequest<Tab | undefined>;
    body.onsuccess = guard(() => {
      const answer = change(stored, body.result);
      if (!answer) return;
      tx.objectStore(TABS_STORE).put(answer.tab, tabKey(id, tabId));
      tx.objectStore(DOCUMENTS_STORE).put(answer.meta);
    });
  });
}

// A whole record with one tab's answer applied, in the answer's tab order.
export function withTab(
  rec: OfflineDocumentRecord,
  answer: { meta: OfflineDocumentMeta; tab: Tab },
): OfflineDocumentRecord {
  const bodies = new Map(rec.tabs.map((t) => [t.id, t] as const));
  bodies.set(answer.tab.id, answer.tab);
  return assemble(answer.meta, bodies);
}
