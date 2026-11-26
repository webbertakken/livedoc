// A PDF document moving between This Browser and LiveDoc (docs/specs/035-pdf-documents/live-editing-and-storage.md
// "Sync Document", "Take Offline"). Loaded only when a document holds a PDF tab, so nothing of a PDF loads with the
// conversions of any other document.
//
// - **Sync Document** sends each stored file, and each picture its marks name (a custom stamp's), to the blob store first, then answers the live changes the create
//   carries: until the create is answered the document stays here.
// - **Take Offline** reads each PDF tab's live changes, which name its stored file, and that file's bytes, from this
//   browser when it holds them and from LiveDoc when not, and the pictures its marks name, and keeps the bytes here: all or nothing, before anything
//   is written and before the server copy goes.
import { pdfTabOf, tabKindOf, type BlobKey, type Tab } from '@livedoc/document';
import { PDF_LIVE_CHANGES_MAX_BYTES, pdfDigest, PdfLiveChanges } from '@livedoc/pdf-documents';
import { base64OfBytes } from '@livedoc/text-documents/base64';
import { ApiError } from '../api/core';
import { apiReadBlob } from '../api/files';
import { apiLoadPdfState } from '../api/pdf-documents';
import { sendBlob } from '../blob-store/send-blob';
import { debugLog } from '../debug-log';
import { blobKeysOfRecord, thisBrowserBlobs } from './offline-blobs';
import type { OfflineDocumentRecord, OfflinePdfDocumentState } from './offline-store';

/** The live changes a create carries, each a Yjs update as base64. */
export type PdfSeedWire = { tabId: string; state: string };

const refusedSync = (status: number, name: string) => {
  debugLog(`[pdf] sync-refused name=${name}`);
  return new ApiError('PDF sync', status, name);
};

/**
 * Sync Document's part for a record's PDF tabs: every stored file sent to the blob store unless it is held already,
 * and the seeds for the create. Rejects by name, with nothing made on LiveDoc but bytes its sweep takes back.
 * `maxBytes`: the most one tab's live changes may be, the limit unless a test hands a smaller.
 */
export async function sendOfflinePdfFiles(
  rec: Pick<OfflineDocumentRecord, 'tabs' | 'pdfDocuments'>,
  ownerId: string,
  maxBytes = PDF_LIVE_CHANGES_MAX_BYTES,
): Promise<PdfSeedWire[]> {
  const files = rec.tabs.flatMap((tab) => {
    const file = pdfTabOf(tab);
    return file ? [{ tabId: tab.id, key: file.blob }] : [];
  });
  const states = (rec.pdfDocuments ?? []).filter((state) =>
    files.some((file) => file.tabId === state.tabId),
  );
  // Before any byte travels: the room would refuse the create for it.
  if (states.some((state) => state.state.byteLength > maxBytes))
    throw refusedSync(413, 'live_changes_too_large');
  const blobs = thisBrowserBlobs();
  let sent = 0;
  let held = 0;
  for (const key of new Set(blobKeysOfRecord({ ...rec, pdfDocuments: states }))) {
    const bytes = await blobs.read(key);
    if (!bytes) throw refusedSync(404, 'blob_missing');
    try {
      if ((await sendBlob(ownerId, key, bytes)).held) held += 1;
    } catch (error) {
      debugLog(`[pdf] sync-refused name=${error instanceof ApiError ? error.code : 'not_sent'}`);
      throw error;
    }
    sent += bytes.byteLength;
  }
  debugLog(`[pdf] sync-sent tabs=${files.length} bytes=${sent} held=${held}`);
  return states.map((state) => ({ tabId: state.tabId, state: base64OfBytes(state.state) }));
}

export type PdfTabsTakenOffline = {
  /** Each PDF tab as the record holds it: naming the stored file its live changes are on, and its size. */
  tabs: Map<string, Tab>;
  states: OfflinePdfDocumentState[];
};

/**
 * Take Offline's part for a document's PDF tabs: each one's live changes read and its stored file kept in this
 * browser. Rejects when any cannot be read or kept, having written no record.
 */
export async function takePdfTabsOffline(
  fetched: readonly Tab[],
  scope: { ownerId: string; documentId: string; shareCode: string | null },
  now: number,
): Promise<PdfTabsTakenOffline> {
  const blobs = thisBrowserBlobs();
  const tabs = new Map<string, Tab>();
  const states: OfflinePdfDocumentState[] = [];
  const kept = new Set<BlobKey>();
  let bytesKept = 0;
  let local = 0;
  try {
    for (const tab of fetched) {
      if (tabKindOf(tab) !== 'pdf') continue;
      const read = await apiLoadPdfState({ ...scope, tabId: tab.id });
      const key = read.storedFile;
      const keep = async (named: BlobKey): Promise<number> => {
        const here = await blobs.readKept(named);
        const bytes = here ?? (await apiReadBlob(scope, named));
        if (here) local += 1;
        // Kept as a document's, whether or not it was here as a cloud document's: full is said, never passed over.
        if (!kept.has(named)) await blobs.keepForDocument(named, bytes);
        kept.add(named);
        bytesKept += bytes.byteLength;
        return bytes.byteLength;
      };
      const size = await keep(key);
      for (const picture of pdfDigest(PdfLiveChanges.load([read.update])).blobKeys)
        await keep(picture);
      tabs.set(tab.id, { ...tab, blob: key, size });
      states.push({ tabId: tab.id, state: read.update, savedAt: now });
    }
  } catch (error) {
    const name = (error as { code?: unknown } | null)?.code;
    debugLog(`[pdf] take-offline-refused name=${typeof name === 'string' ? name : 'not_read'}`);
    throw error;
  }
  debugLog(`[pdf] taken-offline tabs=${tabs.size} bytes=${bytesKept} local=${local}`);
  return { tabs, states };
}
