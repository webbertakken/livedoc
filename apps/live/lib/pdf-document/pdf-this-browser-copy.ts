// What a person is told when a PDF cannot be kept in This Browser or moved out of it (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Errors in This Browser"). Words only: read by the Explorer's menus and the arrival
// alike, so nothing of the engine loads with them.
import type { LocalBlobRefusal } from '@/lib/blob-store/local-blob-store';

/** A browser that will not keep a PDF's bytes, wherever it refuses: a PDF arriving, Take Offline. */
export const LOCAL_STORE_COPY: Record<LocalBlobRefusal, string> = {
  local_store_full: 'This browser has no room to keep this PDF.',
  local_store_unavailable: "This browser can't keep files, so this PDF can't be kept here.",
};

/** What stops a Sync Document of a PDF by name, the document kept here. */
export const PDF_SYNC_REFUSAL_COPY = {
  blob_missing: "This PDF's file is missing from storage.",
  files_unavailable: 'This server has no file storage.',
  usage_exceeded: "This document doesn't fit in the file storage that is left.",
  live_changes_too_large: 'This PDF has more changes than fit. Download it, then add the download.',
} as const;

export type PdfSyncRefusal = keyof typeof PDF_SYNC_REFUSAL_COPY;

export const isPdfSyncRefusal = (code: string | null): code is PdfSyncRefusal =>
  code !== null && Object.hasOwn(PDF_SYNC_REFUSAL_COPY, code);
