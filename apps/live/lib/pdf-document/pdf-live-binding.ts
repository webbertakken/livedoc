// The live changes of an open PDF document as its surface holds them (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "The live model"): one Yjs document, bound to wherever its changes are kept. The
// surface reads marks from it and makes changes in it; what binds it sends and receives.
import type * as Y from 'yjs';
import { PdfLiveChanges } from '@livedoc/pdf-documents';
import type { OfficeSaveStatusSource } from '@/components/office/office-save-status';
import type { PdfStateRead } from '@/lib/api/pdf-documents';
import type { PdfDocumentRefusal } from './pdf-document-bus';

export type PdfLiveBinding = {
  doc: Y.Doc;
  /** Stop sending and receiving. */
  close: () => void;
  /** What the title row's save status reads; null for a session that saves nothing. */
  saveStatus: OfficeSaveStatusSource | null;
  /** Stop for good, keeping nothing in this browser of what was not confirmed ("Limits"). */
  discard: () => Promise<void>;
  /** Listen for a change made here being refused where it is kept ("Limits"). */
  onRefused: (listener: (refusal: PdfDocumentRefusal) => void) => () => void;
};

/** Binds the state a surface read to where its changes are kept. Rejects when it cannot. */
export type BindPdfLiveChanges = (read: PdfStateRead) => Promise<PdfLiveBinding>;

/** The state as a live document bound to nothing: what is changed in it stays in this surface. For tests. */
export const unboundPdfLiveChanges: BindPdfLiveChanges = async (read) => ({
  doc: PdfLiveChanges.load([read.update]),
  close: () => {},
  discard: async () => {},
  saveStatus: null,
  onRefused: () => () => {},
});
