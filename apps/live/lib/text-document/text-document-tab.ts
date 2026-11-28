// A new text document's one tab (docs/specs/034-text-documents/text-document.md "The single-tab document"): named as
// the document is, born in ODF (fork C5). Its writing is not on the tab: the room holds the live state.
import { BORN_TEXT_DOCUMENT_FORMAT, type Tab, type TextDocumentFormat } from '@livedoc/document';

export function newTextDocumentTab(
  tabId: string,
  name: string,
  format: TextDocumentFormat = BORN_TEXT_DOCUMENT_FORMAT,
): Tab {
  return {
    id: tabId,
    name,
    kind: 'text-document',
    format,
    elements: [],
  };
}

/** A new text document's name: "Untitled document", as Google Docs names one. */
export const UNTITLED_TEXT_DOCUMENT = 'Untitled document';

/** A text document tab added to a document of other tabs (docs/specs/006-document/kinds-outside-the-canvas.md). */
export const TEXT_DOCUMENT_TAB_NAME = 'Text document';
