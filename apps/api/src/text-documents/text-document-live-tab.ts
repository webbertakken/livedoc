// The text document as a live tab kind (docs/specs/034-text-documents/live-editing-and-storage.md "Storage";
// docs/specs/006-document/kinds-outside-the-canvas.md "Live state"): its Yjs updates, its tables, sizes and limits.
import {
  TEXT_DOCUMENT_CHUNK_BYTES,
  TEXT_DOCUMENT_FRAME_CHARS,
  TEXT_DOCUMENT_LOG_BYTES,
  TEXT_DOCUMENT_LOG_UPDATES,
  TEXT_DOCUMENT_MAX_CHARS,
  TEXT_DOCUMENT_MAX_STATE_BYTES,
  TextDocumentState,
  textDocumentDigest,
} from '@livedoc/text-documents';
import { liveTabKind } from '../live-tabs/live-tab-kind';

export const TEXT_DOCUMENT_LIVE_TAB = liveTabKind({
  tabKind: 'text-document',
  frame: 'text-document',
  tag: '[text-document]',
  tables: {
    updates: 'text_document_updates',
    chunks: 'text_document_chunks',
    digest: 'text_document_digest',
  },
  state: {
    merge: (updates) => TextDocumentState.merge(updates),
    decodes: (update) => TextDocumentState.decodes(update),
    insertedCharacters: (update) => TextDocumentState.insertedCharacters(update),
    digest: (updates) => textDocumentDigest(TextDocumentState.load(updates)),
  },
  sizes: {
    chunkBytes: TEXT_DOCUMENT_CHUNK_BYTES,
    logBytes: TEXT_DOCUMENT_LOG_BYTES,
    logUpdates: TEXT_DOCUMENT_LOG_UPDATES,
    frameChars: TEXT_DOCUMENT_FRAME_CHARS,
  },
  caps: { characters: TEXT_DOCUMENT_MAX_CHARS, stateBytes: TEXT_DOCUMENT_MAX_STATE_BYTES },
});
