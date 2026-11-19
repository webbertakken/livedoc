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

/** The format a file opens in, by its name: a Word file is held in OOXML, anything else in ODF (fork C1). */
export function formatOfFileName(fileName: string): TextDocumentFormat {
  return /\.(docx|dotx|docm)$/i.test(fileName) ? 'ooxml' : 'odf';
}
