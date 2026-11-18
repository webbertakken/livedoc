// A new text document's one tab (docs/specs/034-text-documents/text-document.md "The single-tab document"): named as
// the document is, born in ODF (fork C5). Its writing is not on the tab: the room holds the live state.
import { BORN_TEXT_DOCUMENT_FORMAT, type Tab } from '@livedoc/document';

export function newTextDocumentTab(tabId: string, name: string): Tab {
  return {
    id: tabId,
    name,
    kind: 'text-document',
    format: BORN_TEXT_DOCUMENT_FORMAT,
    elements: [],
  };
}

/** A new text document's name: "Untitled document", as Google Docs names one. */
export const UNTITLED_TEXT_DOCUMENT = 'Untitled document';
