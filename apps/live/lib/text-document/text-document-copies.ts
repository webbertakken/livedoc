// This browser's copies of text document edits the room has not confirmed (docs/specs/034-text-documents/
// live-editing-and-storage.md "The local copy"): the text document's own database of them, kept as every live tab
// kind's copies are.
import {
  liveTabCopies,
  type CopyKey,
  type LiveTabCopy,
  type LiveTabCopyStore,
} from '@/lib/live-tab/live-tab-copies';

export const TEXT_DOCUMENT_COPIES_DB = 'livedoc-text-documents';

export type { CopyKey };
export type TextDocumentCopy = LiveTabCopy;
export type TextDocumentCopyStore = LiveTabCopyStore;

export const TextDocumentCopies = liveTabCopies(TEXT_DOCUMENT_COPIES_DB);
