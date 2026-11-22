// Stand-ins for where a browser keeps bytes, for tests: a place and an index in memory, and a directory handle that
// behaves as the origin private file system's does (a write replaces the file only when it is closed).
import type { BlobKey } from '@livedoc/document';
import type { BlobDirectory } from './local-blob-opfs';
import {
  localBlobStore,
  type LocalBlobBytes,
  type LocalBlobEntry,
  type LocalBlobIndex,
  type LocalBlobStore,
} from './local-blob-store';

const named = (name: string, message: string) => Object.assign(new Error(message), { name });

/** The error a browser raises when its quota is met. */
export const quotaExceeded = () => named('QuotaExceededError', 'the quota is met');

export type MemoryBlobBytes = LocalBlobBytes & {
  readonly held: Map<BlobKey, Uint8Array<ArrayBuffer>>;
  /** The most bytes it takes in all; past it a write is refused as a full browser refuses. */
  quota: number;
};

export function memoryBlobBytes(quota = Number.POSITIVE_INFINITY): MemoryBlobBytes {
  const held = new Map<BlobKey, Uint8Array<ArrayBuffer>>();
  const place: MemoryBlobBytes = {
    where: 'opfs',
    held,
    quota,
    async write(key, bytes) {
      let weight = bytes.byteLength;
      for (const [other, kept] of held) if (other !== key) weight += kept.byteLength;
      if (weight > place.quota) throw quotaExceeded();
      held.set(key, bytes.slice());
    },
    read: async (key) => held.get(key)?.slice() ?? null,
    async remove(key) {
      held.delete(key);
    },
  };
  return place;
}

export type MemoryBlobIndex = LocalBlobIndex & { readonly entries: Map<BlobKey, LocalBlobEntry> };

export function memoryBlobIndex(): MemoryBlobIndex {
  const entries = new Map<BlobKey, LocalBlobEntry>();
  return {
    entries,
    get: async (key) => entries.get(key) ?? null,
    async put(entry) {
      entries.set(entry.key, entry);
    },
    async remove(key) {
      entries.delete(key);
    },
    all: async () => [...entries.values()],
  };
}

/** A store in memory, with what it is made of. */
export function memoryBlobStore(quota?: number): {
  store: LocalBlobStore;
  bytes: MemoryBlobBytes;
  index: MemoryBlobIndex;
} {
  const bytes = memoryBlobBytes(quota);
  const index = memoryBlobIndex();
  return { store: localBlobStore({ bytes: async () => bytes, index }), bytes, index };
}

export type FakeBlobDirectory = BlobDirectory & {
  readonly files: Map<string, Uint8Array<ArrayBuffer>>;
  readonly directories: Map<string, FakeBlobDirectory>;
  /** Set to make the next write fail as it is written, after the file was made. */
  failWrite: Error | null;
};

/** A directory handle as a browser's: `writable` false is one whose files have no writable stream. */
export function fakeBlobDirectory(options: { writable?: boolean } = {}): FakeBlobDirectory {
  const writable = options.writable ?? true;
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const directories = new Map<string, FakeBlobDirectory>();
  const directory: FakeBlobDirectory = {
    files,
    directories,
    failWrite: null,
    async getDirectoryHandle(name) {
      const found = directories.get(name) ?? fakeBlobDirectory(options);
      directories.set(name, found);
      return found;
    },
    async getFileHandle(name, opening) {
      if (!files.has(name)) {
        if (!opening?.create) throw named('NotFoundError', `no file ${name}`);
        files.set(name, new Uint8Array(0));
      }
      const handle = {
        getFile: async () => ({ arrayBuffer: async () => files.get(name)!.slice().buffer }),
      };
      if (!writable) return handle;
      return {
        ...handle,
        createWritable: async () => {
          let pending: Uint8Array<ArrayBuffer> | null = null;
          return {
            async write(data: Uint8Array<ArrayBuffer>) {
              if (directory.failWrite) {
                const error = directory.failWrite;
                directory.failWrite = null;
                throw error;
              }
              pending = data.slice();
            },
            async close() {
              if (pending) files.set(name, pending);
            },
            async abort() {
              pending = null;
            },
          };
        },
      };
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw named('NotFoundError', `no file ${name}`);
    },
  };
  return directory;
}
