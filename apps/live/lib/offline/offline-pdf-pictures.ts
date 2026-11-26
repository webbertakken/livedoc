// The pictures a This Browser document's PDF live changes name (docs/specs/006-document/blob-store.md "Holds and
// retention": a custom stamp's), read from each tab's live changes. Loaded only for a record that holds PDF live
// changes, so the PDF model never loads with the Explorer.
import type { BlobKey } from '@livedoc/document';
import { pdfDigest, PdfLiveChanges } from '@livedoc/pdf-documents';
import type { OfflinePdfDocumentState } from './offline-store';

export const pictureKeysOf = (
  states: readonly Pick<OfflinePdfDocumentState, 'state'>[],
): BlobKey[] => states.flatMap(({ state }) => pdfDigest(PdfLiveChanges.load([state])).blobKeys);
