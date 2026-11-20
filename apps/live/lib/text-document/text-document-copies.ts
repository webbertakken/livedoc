// This browser's copies of text document edits the room has not confirmed (docs/specs/034-text-documents/
// live-editing-and-storage.md "The local copy"): one record per document and tab in its own database, apart from
// Offline Mode's, so it needs no upgrade of that one. Each call opens the database, runs one transaction and closes
// it, so no tab of the browser holds it between calls. A browser without IndexedDB, or one that refuses, rejects.

export const TEXT_DOCUMENT_COPIES_DB = 'livedoc-text-documents';
const VERSION = 1;
const STORE = 'copies';
// How long opening the database may take before a call gives up: a browser whose IndexedDB never answers must not
// hold an edit back. Safe range: 1 to 10 s.
const OPEN_TIMEOUT_MS = 4_000;

export type CopyKey = { documentId: string; tabId: string };
export type TextDocumentCopy = CopyKey & { update: Uint8Array; savedAt: number };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), OPEN_TIMEOUT_MS);
    const request = indexedDB.open(TEXT_DOCUMENT_COPIES_DB, VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: ['documentId', 'tabId'] });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      // A newer build's upgrade is never held back by this tab.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error ?? new Error('IndexedDB open failed'));
    };
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  act: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export const TextDocumentCopies = {
  /** The copy left for this tab, or null. */
  async read(key: CopyKey): Promise<TextDocumentCopy | null> {
    const found: unknown = await run('readonly', (store) => store.get([key.documentId, key.tabId]));
    if (!found) return null;
    const copy = found as Partial<TextDocumentCopy>;
    // A record not in this shape is no copy of ours: read as none.
    return copy.update instanceof Uint8Array && typeof copy.savedAt === 'number'
      ? { documentId: key.documentId, tabId: key.tabId, update: copy.update, savedAt: copy.savedAt }
      : null;
  },
  /** Keep this tab's copy, replacing any before it. */
  async write(copy: TextDocumentCopy): Promise<void> {
    await run('readwrite', (store) => store.put(copy));
  },
  /** Drop this tab's copy: the room holds everything in it. */
  async remove(key: CopyKey): Promise<void> {
    await run('readwrite', (store) => store.delete([key.documentId, key.tabId]));
  },
} as const;

export type TextDocumentCopyStore = typeof TextDocumentCopies;
