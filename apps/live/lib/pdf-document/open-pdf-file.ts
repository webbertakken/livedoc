// A PDF arriving from the computer (docs/specs/035-pdf-documents/files-print-and-sync.md "Opening"): the file is
// checked to be a PDF by its bytes, hashed here, asked of the blob store, sent only when not already held, and then
// named by a new document's PDF tab. A refusal is answered before any byte travels, and nothing is made.
import { blobKeyOf, FILE_TAB_MAX_BYTES, type BlobKey, type Tab } from '@livedoc/document';
import { isPdfBytes } from '@livedoc/pdf-documents';
import { apiHoldsBlob, apiStoreBlob } from '@/lib/api/files';
import { ApiError, apiCreateDocument } from '@/lib/api-client';
import { debugLog } from '@/lib/debug-log';
import { createIdsFor } from '@/lib/new-document/create-failure';

export const UNTITLED_PDF = 'Untitled PDF';

export type PdfArrivalRefusal = 'not_a_pdf' | 'file_too_large' | 'files_unavailable' | 'not_stored';

/** What a person is told (opening.md "Refusals"; files-print-and-sync.md "Opening"). */
export const PDF_ARRIVAL_COPY: Record<PdfArrivalRefusal, string> = {
  not_a_pdf: 'Drop a PDF here to open it.',
  file_too_large: 'This file is larger than 100 MB, the most LiveDoc holds for one file.',
  files_unavailable: 'This server has no file storage.',
  not_stored: "This PDF couldn't be stored. Try again.",
};

export type OpenedPdf =
  { ok: true; documentId: string; held: boolean } | { ok: false; refusal: PdfArrivalRefusal };

/** The document's name from the file's: its name without the extension. */
export function pdfNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || UNTITLED_PDF;
}

/** The PDF tab a new document is made with: it names its stored file, and holds nothing else. */
export function newPdfTab(id: string, name: string, blob: BlobKey, size: number): Tab {
  return { id, name, kind: 'pdf', elements: [], blob, size };
}

const refusalOf = (error: unknown): PdfArrivalRefusal => {
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'files_unavailable' || code === 'file_too_large') return code;
  return 'not_stored';
};

/** Makes a PDF document of the file, in the folder given (null: the root; undefined: the person's default). */
export async function openPdfFile(
  ownerId: string,
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
  folderId?: string | null,
): Promise<OpenedPdf> {
  if (file.size > FILE_TAB_MAX_BYTES) return { ok: false, refusal: 'file_too_large' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdfBytes(bytes)) return { ok: false, refusal: 'not_a_pdf' };
  const { documentId, tabId } = createIdsFor(null);
  const name = pdfNameFromFile(file.name);
  const started = Date.now();
  try {
    const key = await blobKeyOf(bytes);
    const held = await apiHoldsBlob(ownerId, key);
    if (!held) await apiStoreBlob(ownerId, key, bytes);
    await apiCreateDocument(ownerId, {
      id: documentId,
      name,
      tabs: [newPdfTab(tabId, name, key, bytes.byteLength)],
      ...(folderId === undefined ? {} : { folderId }),
    });
    debugLog(`[pdf] arrived bytes=${bytes.byteLength} held=${held} ms=${Date.now() - started}`);
    return { ok: true, documentId, held };
  } catch (error) {
    const refusal = refusalOf(error);
    debugLog(`[pdf] refused name=${refusal}`);
    return { ok: false, refusal };
  }
}
