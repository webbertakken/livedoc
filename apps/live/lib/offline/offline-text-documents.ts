// A text document's state in This Browser (docs/specs/034-text-documents/live-editing-and-storage.md "A text document
// in This Browser"): each text document tab's whole state rides its document's offline record, so a sync, a Take
// Offline, a duplicate and the local Trash carry it as they carry everything else on the record. A save merges into
// what is stored in one transaction, so another browser tab's saves are never undone.
import * as Y from 'yjs';
import { ApiError } from '../api/core';
import {
  offlineGetRecord,
  offlineUpdateRecord,
  serializeOfflineWrite,
  type OfflineTextDocumentState,
} from './offline-store';

/** The tab's stored state, or null when it has none yet (it reads as the seed). */
export async function offlineTextDocumentState(
  documentId: string,
  tabId: string,
): Promise<Uint8Array | null> {
  const rec = await offlineGetRecord(documentId);
  if (!rec || rec.trashedAt !== undefined)
    throw new ApiError('text document state', 404, 'text_document_not_found');
  return rec.textDocuments?.find((t) => t.tabId === tabId)?.state ?? null;
}

/** Merge `update` into the tab's stored state. */
export function offlineSaveTextDocumentState(
  documentId: string,
  tabId: string,
  update: Uint8Array,
  now = Date.now(),
): Promise<void> {
  return serializeOfflineWrite(() =>
    offlineUpdateRecord(documentId, (rec) => {
      if (!rec || rec.trashedAt !== undefined)
        throw new ApiError('text document save', 404, 'text_document_not_found');
      const states = rec.textDocuments ?? [];
      const stored = states.find((t) => t.tabId === tabId);
      const next: OfflineTextDocumentState = {
        tabId,
        state: stored ? Y.mergeUpdates([stored.state, update]) : update,
        savedAt: now,
      };
      // The document is saved now: the Explorer's Modified, and a sync running meanwhile, see the change.
      return {
        ...rec,
        savedAt: now,
        textDocuments: [...states.filter((t) => t.tabId !== tabId), next],
      };
    }),
  );
}
