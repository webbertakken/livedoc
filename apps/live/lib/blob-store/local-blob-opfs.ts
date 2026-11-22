// A file's bytes in the origin private file system (docs/specs/006-document/blob-store.md "This Browser"): one file
// a key, in a `blobs` directory. A write goes to the browser's own swap file and replaces the key's file only when
// it is closed, so a file under a key is always whole. Where a page cannot write there (no such file system, or one
// with no writable stream), there is none, and the bytes go to IndexedDB instead.
import type { BlobKey } from '@livedoc/document';
import type { LocalBlobBytes } from './local-blob-store';

export const LOCAL_BLOBS_DIRECTORY = 'blobs';
// Written and removed once a page, to learn whether a page may write here at all.
const PROBE = '.probe';

type Writable = {
  write: (data: Uint8Array<ArrayBuffer>) => Promise<void>;
  close: () => Promise<void>;
  abort: () => Promise<void>;
};
type FileHandle = {
  getFile: () => Promise<Pick<File, 'arrayBuffer'>>;
  createWritable?: () => Promise<Writable>;
};
/** What is used of a directory handle: a test hands a fake one. */
export type BlobDirectory = {
  getDirectoryHandle: (name: string, options: { create: boolean }) => Promise<BlobDirectory>;
  getFileHandle: (name: string, options?: { create: boolean }) => Promise<FileHandle>;
  removeEntry: (name: string) => Promise<void>;
};

const browserRoot = (): Promise<BlobDirectory> | null => {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (typeof storage?.getDirectory !== 'function') return null;
  return storage.getDirectory();
};

const isNotFound = (error: unknown): boolean =>
  (error as { name?: unknown } | null)?.name === 'NotFoundError';

/** The origin private file system as a place for bytes, or null where a page cannot keep them there. */
export async function opfsBlobBytes(
  root: () => Promise<BlobDirectory> | null = browserRoot,
): Promise<LocalBlobBytes | null> {
  let directory: BlobDirectory;
  try {
    const top = await root();
    if (!top) return null;
    directory = await top.getDirectoryHandle(LOCAL_BLOBS_DIRECTORY, { create: true });
    const probe = await directory.getFileHandle(PROBE, { create: true });
    await directory.removeEntry(PROBE);
    if (typeof probe.createWritable !== 'function') return null;
  } catch {
    // A browser that offers the file system and then refuses it (a private window): the same as none.
    return null;
  }
  return {
    where: 'opfs',
    async write(key: BlobKey, bytes) {
      const handle = await directory.getFileHandle(key, { create: true });
      const writable = await handle.createWritable!();
      try {
        await writable.write(bytes);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
      }
    },
    async read(key) {
      try {
        const handle = await directory.getFileHandle(key);
        return new Uint8Array(await (await handle.getFile()).arrayBuffer());
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async remove(key) {
      try {
        await directory.removeEntry(key);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    },
  };
}
