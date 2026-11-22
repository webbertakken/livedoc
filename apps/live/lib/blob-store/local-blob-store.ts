// This browser's own blob store (docs/specs/006-document/blob-store.md "This Browser"): a file's bytes kept under
// their key, beside an index that names each key held, its size and when it was last used. The index entry is
// written first and the bytes after it, so a keep that never ended leaves an entry without bytes, which a read finds
// and removes: nothing is half kept, and nothing is left that no entry names. A browser that refuses is named.
import type { BlobKey } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';

export type LocalBlobRefusal = 'local_store_full' | 'local_store_unavailable';

/** This browser would not keep, or could not reach, a file's bytes. */
export class LocalBlobRefused extends Error {
  readonly code: LocalBlobRefusal;
  constructor(code: LocalBlobRefusal, cause?: unknown) {
    super(`local blob store: ${code}`, { cause });
    this.code = code;
    this.name = 'LocalBlobRefused';
  }
}

export type LocalBlobEntry = { key: BlobKey; size: number; usedAt: number };

/** Where the bytes themselves are: the origin private file system, or IndexedDB. A write is whole or not at all. */
export type LocalBlobBytes = {
  readonly where: 'opfs' | 'indexeddb';
  write: (key: BlobKey, bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  /** The bytes, or null when none are kept under the key. */
  read: (key: BlobKey) => Promise<Uint8Array<ArrayBuffer> | null>;
  remove: (key: BlobKey) => Promise<void>;
};

export type LocalBlobIndex = {
  get: (key: BlobKey) => Promise<LocalBlobEntry | null>;
  put: (entry: LocalBlobEntry) => Promise<void>;
  remove: (key: BlobKey) => Promise<void>;
  all: () => Promise<LocalBlobEntry[]>;
};

export type LocalBlobStore = {
  /** Keeps the bytes under their key, whole. Rejects with `LocalBlobRefused`, and then keeps nothing new. */
  keep: (key: BlobKey, bytes: Uint8Array<ArrayBuffer>, now?: number) => Promise<void>;
  /** The bytes kept under the key, marked used; null when this browser does not hold them whole. */
  read: (key: BlobKey, now?: number) => Promise<Uint8Array<ArrayBuffer> | null>;
  /** Forgets each key's bytes and entry. */
  forget: (keys: readonly BlobKey[]) => Promise<void>;
  /** Every key held, with its size and when it was last used. */
  entries: () => Promise<LocalBlobEntry[]>;
};

const short = (key: BlobKey) => key.slice(0, 8);

// A browser names a met quota the same way in the origin private file system and in IndexedDB.
const refusalOf = (error: unknown): LocalBlobRefused =>
  error instanceof LocalBlobRefused
    ? error
    : new LocalBlobRefused(
        (error as { name?: unknown } | null)?.name === 'QuotaExceededError'
          ? 'local_store_full'
          : 'local_store_unavailable',
        error,
      );

const refused = (error: unknown, key: BlobKey): LocalBlobRefused => {
  const refusal = refusalOf(error);
  debugLog(`[blob-store] local-refused name=${refusal.code} key=${short(key)}`);
  return refusal;
};

/**
 * The store over where its bytes and its index are. `bytes` is asked each time, so a browser whose storage answers
 * only later is not written off; it rejects with `LocalBlobRefused` where there is nowhere to keep bytes.
 */
export function localBlobStore(deps: {
  bytes: () => Promise<LocalBlobBytes>;
  index: LocalBlobIndex;
}): LocalBlobStore {
  const { index } = deps;
  return {
    async keep(key, bytes, now = Date.now()) {
      let place: LocalBlobBytes | null = null;
      let before: LocalBlobEntry | null = null;
      let entered = false;
      try {
        // A blob is never empty: bytes handed over to a worker before they were kept would be.
        if (bytes.byteLength === 0) throw new Error('no bytes to keep');
        place = await deps.bytes();
        before = await index.get(key);
        await index.put({ key, size: bytes.byteLength, usedAt: now });
        entered = true;
        await place.write(key, bytes);
        debugLog(
          `[blob-store] local-kept bytes=${bytes.byteLength} where=${place.where} key=${short(key)}`,
        );
      } catch (error) {
        // The bytes of an earlier keep are whole still: its entry stands again. Without one, what the write left goes
        // with the entry.
        if (entered && before) await index.put(before).catch(() => {});
        else if (entered) {
          await place?.remove(key).catch(() => {});
          await index.remove(key).catch(() => {});
        }
        throw refused(error, key);
      }
    },

    async read(key, now = Date.now()) {
      try {
        const place = await deps.bytes();
        const [entry, bytes] = await Promise.all([index.get(key), place.read(key)]);
        // A blob is never empty: no bytes, or not the size the index says, is not the file.
        if (!bytes?.byteLength || (entry && entry.size !== bytes.byteLength)) {
          // Not here whole: what is left of it goes, so the key reads the same way next time.
          if (bytes) await place.remove(key);
          if (entry) await index.remove(key);
          debugLog(`[blob-store] local-miss key=${short(key)}`);
          return null;
        }
        await index.put({ key, size: bytes.byteLength, usedAt: now });
        debugLog(`[blob-store] local-read bytes=${bytes.byteLength} key=${short(key)}`);
        return bytes;
      } catch (error) {
        throw refused(error, key);
      }
    },

    async forget(keys) {
      for (const key of keys) {
        try {
          const place = await deps.bytes();
          await place.remove(key);
          await index.remove(key);
        } catch (error) {
          throw refused(error, key);
        }
      }
    },

    async entries() {
      try {
        return await index.all();
      } catch (error) {
        throw refusalOf(error);
      }
    },
  };
}
