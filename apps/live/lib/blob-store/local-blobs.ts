// What this browser keeps of files, and what it may forget (docs/specs/006-document/blob-store.md "This Browser"):
// the bytes of This Browser documents are never forgotten; a cloud document's, kept once read whole, are forgotten
// least recently used first past FILE_LOCAL_CACHE_MAX_BYTES, and all of them when the person signs out. Which keys
// This Browser documents name is asked of the offline records each time, never kept twice.
import { FILE_LOCAL_CACHE_MAX_BYTES, FILE_LOCAL_FRESH_MS, type BlobKey } from '@livedoc/document';
import { debugLog } from '@/lib/debug-log';
import { LocalBlobRefused, type LocalBlobEntry, type LocalBlobStore } from './local-blob-store';

/** Why bytes were forgotten: past the cache's limit, with their document, or with the account that left. */
type Forgetting = 'cache' | 'document' | 'sign-out';

export type LocalBlobsDeps = {
  store: LocalBlobStore;
  /** Every key a This Browser document names, in the local Trash too. */
  named: () => Promise<ReadonlySet<BlobKey>>;
  /** Asks the browser to keep this origin's storage; false where it will not say. */
  persist: () => Promise<boolean>;
  now?: () => number;
  /** The limits, the spec's unless a test hands smaller. */
  maxBytes?: number;
  freshMs?: number;
};

export type LocalBlobs = {
  /** Keeps a This Browser document's bytes. Rejects with `LocalBlobRefused`. */
  keepForDocument: (key: BlobKey, bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  /** Keeps a cloud document's bytes that were read whole; a browser that refuses changes nothing. */
  keepRead: (key: BlobKey, bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  /** The bytes this browser holds under the key, or null. Rejects with `LocalBlobRefused`. */
  read: (key: BlobKey) => Promise<Uint8Array<ArrayBuffer> | null>;
  /** The same, for a reader that has somewhere else to ask: a store that cannot be reached holds nothing. */
  readKept: (key: BlobKey) => Promise<Uint8Array<ArrayBuffer> | null>;
  /** Forgets those of `keys` no This Browser document names any more. */
  forgetUnnamed: (keys: readonly BlobKey[]) => Promise<void>;
  /** Forgets every key no This Browser document names: a person signed out. */
  forgetCloud: () => Promise<void>;
};

export function localBlobs(deps: LocalBlobsDeps): LocalBlobs {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const maxBytes = deps.maxBytes ?? FILE_LOCAL_CACHE_MAX_BYTES;
  const freshMs = deps.freshMs ?? FILE_LOCAL_FRESH_MS;
  let asked = false;

  const forget = async (entries: readonly LocalBlobEntry[], why: Forgetting) => {
    if (entries.length === 0) return;
    await store.forget(entries.map((entry) => entry.key));
    const bytes = entries.reduce((sum, entry) => sum + entry.size, 0);
    debugLog(`[blob-store] local-forgotten count=${entries.length} bytes=${bytes} why=${why}`);
  };

  // Forgets the least recently used of what no document names until what is left of it weighs at most `most`.
  // Bytes kept a moment ago stay: their document may be about to be written.
  const trim = async (most: number) => {
    const named = await deps.named();
    const cached = (await store.entries())
      .filter((entry) => !named.has(entry.key))
      .sort((a, b) => a.usedAt - b.usedAt);
    let weight = cached.reduce((sum, entry) => sum + entry.size, 0);
    const going: LocalBlobEntry[] = [];
    const freshFrom = now() - freshMs;
    for (const entry of cached) {
      if (weight <= most) break;
      if (entry.usedAt > freshFrom) continue;
      going.push(entry);
      weight -= entry.size;
    }
    await forget(going, 'cache');
  };

  const askToPersist = async () => {
    if (asked) return;
    asked = true;
    const granted = await deps.persist().catch(() => false);
    debugLog(`[blob-store] local-persist granted=${granted}`);
  };

  return {
    async keepForDocument(key, bytes) {
      await askToPersist();
      try {
        await store.keep(key, bytes, now());
      } catch (error) {
        if (!(error instanceof LocalBlobRefused) || error.code !== 'local_store_full') throw error;
        // Full: everything that may be forgotten makes room, once.
        await trim(0);
        await store.keep(key, bytes, now());
      }
    },

    async keepRead(key, bytes) {
      try {
        await store.keep(key, bytes, now());
        await trim(maxBytes);
      } catch (error) {
        debugLog(`[blob-store] local-keep-skipped key=${key.slice(0, 8)}`, String(error));
      }
    },

    read: (key) => store.read(key, now()),

    readKept: (key) => store.read(key, now()).catch(() => null),

    async forgetUnnamed(keys) {
      const named = await deps.named();
      const wanted = new Set(keys.filter((key) => !named.has(key)));
      await forget(
        (await store.entries()).filter((entry) => wanted.has(entry.key)),
        'document',
      );
    },

    async forgetCloud() {
      const named = await deps.named();
      await forget(
        (await store.entries()).filter((entry) => !named.has(entry.key)),
        'sign-out',
      );
    },
  };
}
