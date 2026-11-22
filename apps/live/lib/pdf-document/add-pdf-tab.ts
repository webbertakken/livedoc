// A PDF from the computer joining an open document as a PDF tab (docs/specs/035-pdf-documents/pdf-document.md "A PDF
// tab from a file"): the file is taken as every arriving PDF is, sent to the blob store for the document's owner,
// and the tab's row stored, in that order, before the editor learns of the tab. So a tab never names bytes the store
// does not hold, its surface never opens on a row not stored, and a refusal leaves nothing behind.
import type { Tab } from '@livedoc/document';
import { apiSaveTab } from '@/lib/api/tabs';
import { sendBlob } from '@/lib/blob-store/send-blob';
import { debugLog } from '@/lib/debug-log';
import { thisBrowserBlobs } from '@/lib/offline/offline-blobs';
import { newPdfTab, refusalOf, refused, takePdfFile, type PdfRefused } from './open-pdf-file';

export { PDF_ARRIVAL_COPY } from './open-pdf-file';

/** The open document a PDF tab joins, and who adds it. */
export type PdfTabScope = { ownerId: string; documentId: string; shareCode: string | null };

export type AddedPdfTab = { ok: true; tab: Tab; held: boolean } | PdfRefused;

/** Stores the file and a PDF tab `tabId` naming it in the document; the tab, for the editor to add. */
export async function addPdfTab(
  scope: PdfTabScope,
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
  tabId: string,
): Promise<AddedPdfTab> {
  const started = Date.now();
  const taken = await takePdfFile(file, true);
  if (!taken.ok) return taken;
  const { bytes, key, name } = taken;
  const { ownerId, documentId, shareCode } = scope;
  try {
    const { held } = await sendBlob(ownerId, key, bytes, { document: { documentId, shareCode } });
    const tab = newPdfTab(tabId, name, key, bytes.byteLength);
    await apiSaveTab(ownerId, documentId, tab, shareCode);
    // Kept as a cloud document's file is once read, so the tab opens without reading the bytes back.
    await thisBrowserBlobs().keepRead(key, bytes);
    debugLog(
      `[pdf] arrived bytes=${bytes.byteLength} held=${held} ms=${Date.now() - started} tab=${tabId}`,
    );
    return { ok: true, tab, held };
  } catch (error) {
    return refused(refusalOf(error));
  }
}
