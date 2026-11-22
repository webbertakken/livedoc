// A PDF document's live changes in This Browser (docs/specs/035-pdf-documents/live-editing-and-storage.md "A PDF
// document in This Browser"): each PDF tab's whole live changes ride its document's offline record, so a sync, a Take
// Offline, a duplicate and the local Trash carry them as they carry everything else on the record. A save merges into
// what is stored in one transaction, so another browser tab's saves are never undone. The file is not here: the tab
// names it by key and size.
import * as Y from 'yjs';
import { pdfTabOf } from '@livedoc/document';
import { PdfLiveChanges } from '@livedoc/pdf-documents';
import { ApiError } from '../api/core';
import type { PdfStateRead } from '../api/pdf-documents';
import { joinPartingCopies } from '../live-tab/live-tab-parting';
import type { PartingStorage } from '../live-tab/live-tab-parting-keys';
import {
  offlineGetRecord,
  offlineUpdateRecord,
  serializeOfflineWrite,
  type OfflineDocumentRecord,
  type OfflinePdfDocumentState,
} from './offline-store';

const gone = (action: string) => new ApiError(action, 404, 'pdf_not_found');

// The record's PDF tab, as the room answers a tab that is no PDF tab of the document.
function pdfTabIn(rec: OfflineDocumentRecord | null | undefined, tabId: string, action: string) {
  const file =
    rec && rec.trashedAt === undefined ? pdfTabOf(rec.tabs.find((t) => t.id === tabId)) : null;
  if (!file) throw gone(action);
  return file;
}

/**
 * The tab's live changes as a read of them answers: the update, its state vector, and the stored file they are on,
 * which is the tab's own until a change names one.
 */
export async function offlinePdfStateRead(
  documentId: string,
  tabId: string,
): Promise<PdfStateRead> {
  const rec = await offlineGetRecord(documentId);
  const file = pdfTabIn(rec, tabId, 'PDF state');
  const state = rec?.pdfDocuments?.find((t) => t.tabId === tabId)?.state;
  const update = PdfLiveChanges.merge(state ? [state] : []);
  const named = PdfLiveChanges.stored(PdfLiveChanges.load([update]));
  return {
    update,
    stateVector: PdfLiveChanges.stateVectorOf(update),
    storedFile: named?.blob ?? file.blob,
  };
}

/** Merge `update` into the tab's stored live changes. */
export function offlineSavePdfState(
  documentId: string,
  tabId: string,
  update: Uint8Array,
  now = Date.now(),
): Promise<void> {
  return serializeOfflineWrite(() =>
    offlineUpdateRecord(documentId, (rec) => {
      pdfTabIn(rec, tabId, 'PDF save');
      const states = rec!.pdfDocuments ?? [];
      const stored = states.find((t) => t.tabId === tabId);
      const next: OfflinePdfDocumentState = {
        tabId,
        state: stored ? Y.mergeUpdates([stored.state, update]) : update,
        savedAt: now,
      };
      // The document is saved now: the Explorer's Modified, and a sync running meanwhile, see the change.
      return {
        ...rec!,
        savedAt: now,
        pdfDocuments: [...states.filter((t) => t.tabId !== tabId), next],
      };
    }),
  );
}

/**
 * Join what a closing page left of each PDF tab to the record ("A page's last moment"), as the tab's next open
 * would. Answers how many joined.
 */
export async function offlineJoinPdfPartingCopies(
  rec: Pick<OfflineDocumentRecord, 'id' | 'tabs'>,
  storage: PartingStorage | null,
): Promise<number> {
  let joined = 0;
  for (const tab of rec.tabs) {
    if (!pdfTabOf(tab)) continue;
    joined += await joinPartingCopies(
      storage,
      { documentId: rec.id, tabId: tab.id, tag: '[pdf]' },
      (update) => offlineSavePdfState(rec.id, tab.id, update),
    );
  }
  return joined;
}
