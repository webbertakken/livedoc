// This browser's blob store as the offline documents use it (docs/specs/006-document/blob-store.md "This Browser"):
// the origin private file system where a page can write it, IndexedDB where not, and never forgetting a key a This
// Browser document names, which is asked of the offline records each time.
import { pdfTabOf, type BlobKey } from '@livedoc/document';
import { indexedDbBlobBytes, indexedDbBlobIndex } from '../blob-store/local-blob-indexeddb';
import { opfsBlobBytes } from '../blob-store/local-blob-opfs';
import { localBlobStore, type LocalBlobBytes } from '../blob-store/local-blob-store';
import { localBlobs, type LocalBlobs } from '../blob-store/local-blobs';
import { offlineBackend, type OfflineDocumentRecord } from './offline-store';

/**
 * The keys a record's PDF tabs name: each tab's file, and each picture its marks name (a custom stamp's), read by a
 * module loaded only for a record holding PDF live changes.
 */
export async function blobKeysOfRecord(
  rec: Pick<OfflineDocumentRecord, 'tabs' | 'pdfDocuments'>,
): Promise<BlobKey[]> {
  const states = rec.pdfDocuments ?? [];
  const pictures =
    states.length > 0 ? (await import('./offline-pdf-pictures')).pictureKeysOf(states) : [];
  return [...rec.tabs.flatMap((tab) => pdfTabOf(tab)?.blob ?? []), ...pictures];
}

/** Every key a This Browser document names, in the local Trash too. */
export async function offlineNamedBlobKeys(): Promise<Set<BlobKey>> {
  const records = await offlineBackend().all();
  return new Set((await Promise.all(records.map(blobKeysOfRecord))).flat());
}

const persist = async (): Promise<boolean> => {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  return typeof storage?.persist === 'function' ? storage.persist() : false;
};

let blobs: LocalBlobs | null = null;

/** The browser's own store. One a page: where its bytes go is learnt once. */
export function thisBrowserBlobs(): LocalBlobs {
  if (blobs) return blobs;
  let place: Promise<LocalBlobBytes> | null = null;
  blobs = localBlobs({
    store: localBlobStore({
      bytes: () => (place ??= opfsBlobBytes().then((opfs) => opfs ?? indexedDbBlobBytes())),
      index: indexedDbBlobIndex(),
    }),
    named: offlineNamedBlobKeys,
    persist,
  });
  return blobs;
}

/** Test seam: hand the store to use, or null for the browser's own. */
export function __setThisBrowserBlobs(next: LocalBlobs | null): void {
  blobs = next;
}
