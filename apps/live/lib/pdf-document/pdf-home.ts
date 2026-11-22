// Where an open PDF document's live changes and its stored file are (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Storage", "Offline and This Browser"): the document's room and LiveDoc's blob store,
// or This Browser. The surface reads through whichever its document is in.
//
// - **The room**: the stored file is read from this browser when it was kept here once read whole, with no request
//   for the bytes, and kept here when it was read from LiveDoc. The state is always asked of LiveDoc first, which
//   says what the person may read, so a kept key opens nothing by itself.
// - **This Browser**: the state is the offline record's, and the bytes are this browser's alone; bytes it no longer
//   holds are a file missing from storage.
import type { BlobKey } from '@livedoc/document';
import { apiReadBlob } from '@/lib/api/files';
import { ApiError } from '@/lib/api/core';
import { apiLoadPdfState, type PdfDocumentScope, type PdfStateRead } from '@/lib/api/pdf-documents';
import type { LocalBlobs } from '@/lib/blob-store/local-blobs';
import { debugLog } from '@/lib/debug-log';
import { thisBrowserBlobs } from '@/lib/offline/offline-blobs';
import { offlinePdfStateRead } from '@/lib/offline/offline-pdf-documents';

export type PdfHome = 'room' | 'this-browser';

/** What a surface reads of its PDF: the live changes with the stored file they are on, and that file's bytes. */
export type PdfReads = {
  loadState: (scope: PdfDocumentScope) => Promise<PdfStateRead>;
  readBlob: (scope: PdfDocumentScope, key: BlobKey) => Promise<Uint8Array<ArrayBuffer>>;
};

type ReadBlob = PdfReads['readBlob'];

/** A read of a cloud document's file that asks this browser first, and keeps here what LiveDoc sent. */
export const keptBlobRead =
  (read: ReadBlob, blobs: () => Pick<LocalBlobs, 'readKept' | 'keepRead'>): ReadBlob =>
  async (scope, key) => {
    const kept = await blobs().readKept(key);
    if (kept) {
      debugLog(`[pdf] kept-read bytes=${kept.byteLength}`);
      return kept;
    }
    const bytes = await read(scope, key);
    // Kept for the next open; the pages do not wait for it.
    void blobs().keepRead(key, bytes);
    return bytes;
  };

/** A read of a This Browser document's file: this browser's bytes, or the refusal a file missing from storage is. */
export const thisBrowserBlobRead =
  (blobs: () => Pick<LocalBlobs, 'read'>): ReadBlob =>
  async (_scope, key) => {
    const bytes = await blobs().read(key);
    if (!bytes) throw new ApiError('file read', 404, 'blob_missing');
    return bytes;
  };

const READS: Record<PdfHome, PdfReads> = {
  room: { loadState: apiLoadPdfState, readBlob: keptBlobRead(apiReadBlob, thisBrowserBlobs) },
  'this-browser': {
    loadState: (scope) => offlinePdfStateRead(scope.documentId, scope.tabId),
    readBlob: thisBrowserBlobRead(thisBrowserBlobs),
  },
};

export const pdfReadsOf = (home: PdfHome): PdfReads => READS[home];
