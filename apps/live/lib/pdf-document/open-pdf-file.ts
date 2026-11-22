// A PDF arriving from the computer (docs/specs/035-pdf-documents/files-print-and-sync.md "Opening"): the file is
// checked to be a PDF by its bytes, hashed here, asked of the blob store, sent only when not already held, and then
// named by a new document's PDF tab. A refusal is answered before any byte travels, and nothing is made. Where it is
// kept is where a new document is: for someone whose documents start in This Browser the file is kept in this
// browser's own store and named by a new offline record, and no request carries its bytes or its name
// (live-editing-and-storage.md "A PDF that arrives").
import {
  blobKeyOf,
  FILE_TAB_MAX_BYTES,
  truncateName,
  type BlobKey,
  type Tab,
} from '@livedoc/document';
import { isPdfBytes } from '@livedoc/pdf-documents';
import { LocalBlobRefused, type LocalBlobRefusal } from '@/lib/blob-store/local-blob-store';
import { LOCAL_STORE_COPY } from './pdf-this-browser-copy';
import { sendBlob } from '@/lib/blob-store/send-blob';
import { ApiError, apiCreateDocument } from '@/lib/api-client';
import { fileStorageRefused } from '@/lib/api/capabilities';
import { debugLog } from '@/lib/debug-log';
import { createIdsFor } from '@/lib/new-document/create-failure';
import { thisBrowserBlobs } from '@/lib/offline/offline-blobs';
import { offlineCreateDocument } from '@/lib/offline/offline-store';
import { isOfflineLocation, type SaveLocationId } from '@/lib/save-locations';

export const UNTITLED_PDF = 'Untitled PDF';

export type PdfArrivalRefusal =
  | 'not_a_pdf'
  | 'file_too_large'
  | 'files_unavailable'
  | 'usage_exceeded'
  | 'not_stored'
  | LocalBlobRefusal;

/** What a person is told (opening.md "Refusals"; files-print-and-sync.md "Opening"). */
export const PDF_ARRIVAL_COPY: Record<PdfArrivalRefusal, string> = {
  not_a_pdf: 'Drop a PDF here to open it.',
  file_too_large: 'This file is larger than 100 MB, the most LiveDoc holds for one file.',
  files_unavailable: 'This server has no file storage.',
  usage_exceeded: "This file doesn't fit in the file storage that is left.",
  not_stored: "This PDF couldn't be stored. Try again.",
  ...LOCAL_STORE_COPY,
};

export type PdfRefused = { ok: false; refusal: PdfArrivalRefusal };

export type OpenedPdf = { ok: true; documentId: string; held: boolean } | PdfRefused;

/** A file taken as a PDF: its bytes, the key they hash to, and the name it gives what is made of it. */
export type TakenPdf =
  { ok: true; bytes: Uint8Array<ArrayBuffer>; key: BlobKey; name: string } | PdfRefused;

/** The document's name from the file's: its name without the extension, within a name's length. */
export function pdfNameFromFile(fileName: string): string {
  return truncateName(fileName.replace(/\.[^.]+$/, '')) || UNTITLED_PDF;
}

/** The PDF tab a new document is made with: it names its stored file, and holds nothing else. */
export function newPdfTab(id: string, name: string, blob: BlobKey, size: number): Tab {
  return { id, name, kind: 'pdf', elements: [], blob, size };
}

/** The refusal a failed send or save is: the store's own by name, else not stored. */
export const refusalOf = (error: unknown): PdfArrivalRefusal => {
  if (error instanceof LocalBlobRefused) return error.code;
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'files_unavailable' || code === 'file_too_large' || code === 'usage_exceeded')
    return code;
  return 'not_stored';
};

/** A refusal, logged by its name: the ones answered before a byte travels too. */
export const refused = (refusal: PdfArrivalRefusal): PdfRefused => {
  debugLog(`[pdf] refused name=${refusal}`);
  return { ok: false, refusal };
};

/**
 * Takes a file as a PDF about to be kept. Refused before a byte of it is read: a file past the cap, and one that
 * would be `sent` to a host that says it stores no files (docs/specs/006-document/blob-store.md "Without object
 * storage"). Then read, checked to be a PDF by its bytes, and hashed.
 */
export async function takePdfFile(
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
  sent: boolean,
): Promise<TakenPdf> {
  if (file.size > FILE_TAB_MAX_BYTES) return refused('file_too_large');
  if (sent && (await fileStorageRefused())) return refused('files_unavailable');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdfBytes(bytes)) return refused('not_a_pdf');
  try {
    return { ok: true, bytes, key: await blobKeyOf(bytes), name: pdfNameFromFile(file.name) };
  } catch {
    return refused('not_stored');
  }
}

// Keeps the file in this browser and names it by a new offline record. The bytes are kept first: a record never
// names bytes this browser does not hold.
async function keepHere(
  ids: { documentId: string; tabId: string },
  name: string,
  key: BlobKey,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const blobs = thisBrowserBlobs();
  await blobs.keepForDocument(key, bytes);
  try {
    await offlineCreateDocument(
      { id: ids.documentId, name, tabs: [newPdfTab(ids.tabId, name, key, bytes.byteLength)] },
      Date.now(),
    );
  } catch (error) {
    // No record names them: unless another document does, the bytes go again.
    await blobs.forgetUnnamed([key]).catch(() => {});
    throw error;
  }
}

/**
 * Makes a PDF document of the file, in the folder given (null: the root; undefined: the person's default), kept
 * `where` a new document of theirs is.
 */
export async function openPdfFile(
  ownerId: string,
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
  folderId?: string | null,
  where: SaveLocationId = 'livedoc',
): Promise<OpenedPdf> {
  const started = Date.now();
  const here = isOfflineLocation(where);
  const taken = await takePdfFile(file, !here);
  if (!taken.ok) return taken;
  const { bytes, key, name } = taken;
  const { documentId, tabId } = createIdsFor(null);
  try {
    if (here) {
      await keepHere({ documentId, tabId }, name, key, bytes);
      debugLog(
        `[pdf] arrived bytes=${bytes.byteLength} where=this-browser ms=${Date.now() - started}`,
      );
      return { ok: true, documentId, held: false };
    }
    const { held } = await sendBlob(ownerId, key, bytes);
    await apiCreateDocument(ownerId, {
      id: documentId,
      name,
      tabs: [newPdfTab(tabId, name, key, bytes.byteLength)],
      ...(folderId === undefined ? {} : { folderId }),
    });
    debugLog(`[pdf] arrived bytes=${bytes.byteLength} held=${held} ms=${Date.now() - started}`);
    return { ok: true, documentId, held };
  } catch (error) {
    return refused(refusalOf(error));
  }
}
