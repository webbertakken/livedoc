// The IndexedDB side of this browser's blob store (docs/specs/006-document/blob-store.md "This Browser"): the index of
// what is held, and, where the origin private file system cannot be written, the bytes themselves in a store of
// their own. A database apart from Offline Mode's, so it needs no upgrade of that one. Each call opens it, runs one
// transaction and closes it, so no tab of the browser holds it between calls.
import type { BlobKey } from '@livedoc/document';
import type { LocalBlobBytes, LocalBlobEntry, LocalBlobIndex } from './local-blob-store';

export const LOCAL_BLOBS_DB = 'livedoc-blobs';
const VERSION = 1;
const INDEX = 'index';
const BYTES = 'bytes';
// How long opening the database may take before a call gives up, as every local database here. Safe range: 1 to 10 s.
const OPEN_TIMEOUT_MS = 4_000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const timer = setTimeout(() => reject(new Error('IndexedDB open timed out')), OPEN_TIMEOUT_MS);
    const request = indexedDB.open(LOCAL_BLOBS_DB, VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(INDEX, { keyPath: 'key' });
      request.result.createObjectStore(BYTES);
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
  name: typeof INDEX | typeof BYTES,
  mode: IDBTransactionMode,
  act: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = act(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      // A met quota aborts the transaction, and its error says so by name.
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

const entryOf = (found: unknown): LocalBlobEntry | null => {
  const entry = found as Partial<LocalBlobEntry> | undefined;
  // A record not in this shape is no entry of ours: read as none.
  if (typeof entry?.key !== 'string' || typeof entry.size !== 'number') return null;
  if (typeof entry.usedAt !== 'number') return null;
  return { key: entry.key, size: entry.size, usedAt: entry.usedAt };
};

/** The index of what this browser holds. */
export const indexedDbBlobIndex = (): LocalBlobIndex => ({
  get: async (key) => entryOf(await run<unknown>(INDEX, 'readonly', (store) => store.get(key))),
  async put(entry) {
    await run(INDEX, 'readwrite', (store) => store.put(entry));
  },
  async remove(key) {
    await run(INDEX, 'readwrite', (store) => store.delete(key));
  },
  async all() {
    const found = await run<unknown[]>(INDEX, 'readonly', (store) => store.getAll());
    return found.flatMap((each) => entryOf(each) ?? []);
  },
});

/** IndexedDB as the place for the bytes themselves: each held whole, and read whole into memory. */
export const indexedDbBlobBytes = (): LocalBlobBytes => ({
  where: 'indexeddb',
  async write(key: BlobKey, bytes) {
    // The view's own bytes: a view onto part of a larger buffer is copied out of it.
    const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
    await run(BYTES, 'readwrite', (store) =>
      store.put(whole ? bytes.buffer : bytes.slice().buffer, key),
    );
  },
  async read(key) {
    const found = await run<unknown>(BYTES, 'readonly', (store) => store.get(key));
    // By its tag, not its constructor: a value read back may be another realm's.
    return Object.prototype.toString.call(found) === '[object ArrayBuffer]'
      ? new Uint8Array(found as ArrayBuffer)
      : null;
  },
  async remove(key) {
    await run(BYTES, 'readwrite', (store) => store.delete(key));
  },
});
