// The PDF document as a live tab kind (docs/specs/035-pdf-documents/live-editing-and-storage.md "Storage";
// docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): its live changes are Yjs updates the room stores,
// chunks and compacts as every live tab kind's. The kind declares only what is its own.
import { pdfTabOf } from '@livedoc/document';
import {
  PDF_CHUNK_BYTES,
  PDF_FRAME_CHARS,
  PDF_LIVE_CHANGES_MAX_BYTES,
  PDF_LOG_BYTES,
  PDF_LOG_UPDATES,
  PdfLiveChanges,
  pdfDigest,
  pdfLevelAsked,
} from '@livedoc/pdf-documents';
import { liveTabKind } from '../live-tabs/live-tab-kind';
import { PDF_REPLACEMENT } from './pdf-replacement';

export const PDF_LIVE_TAB = liveTabKind({
  tabKind: 'pdf',
  frame: 'pdf',
  tag: '[pdf]',
  tables: { updates: 'pdf_updates', chunks: 'pdf_chunks', digest: 'pdf_digest' },
  state: {
    merge: (updates) => PdfLiveChanges.merge(updates),
    decodes: (update) => PdfLiveChanges.decodes(update),
    // A PDF's size is its stored file's; its live changes are bounded by their bytes alone.
    insertedCharacters: () => 0,
    digest: (updates) => pdfDigest(PdfLiveChanges.load(updates)),
    // "The room's op kinds": a Participant's update is judged by the roots it touches.
    asks: (stored, update, tab) => pdfLevelAsked(stored, update, pdfTabOf(tab)?.blob ?? null),
  },
  sizes: {
    chunkBytes: PDF_CHUNK_BYTES,
    logBytes: PDF_LOG_BYTES,
    logUpdates: PDF_LOG_UPDATES,
    frameChars: PDF_FRAME_CHARS,
  },
  caps: { characters: Number.MAX_SAFE_INTEGER, stateBytes: PDF_LIVE_CHANGES_MAX_BYTES },
  // The live changes are changes to the stored file the tab names: one made on another file is refused.
  standsOn: (tab) => pdfTabOf(tab)?.blob ?? null,
  replace: PDF_REPLACEMENT,
});
