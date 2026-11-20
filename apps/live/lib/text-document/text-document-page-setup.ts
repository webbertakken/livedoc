// Page setup applied (docs/specs/034-text-documents/page-layout.md "Page setup", "Pageless"): the paper a new document starts on
// by the browser's locale, and a setup set over the whole document as one undo step: the first section's whole, and
// each later section's paper, orientation and margins (its columns its own; the page colour is the document's).
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  SECTION_BREAK,
  TextDocumentState,
  type PageSetup,
  type PaperName,
} from '@livedoc/text-documents';
import { debugLog } from '@/lib/debug-log';
import { startUndoStep, TEXT_DOCUMENT_PAGE_ORIGIN } from './text-document-undo';

/** Letter where the browser's language is of the United States or Canada, A4 elsewhere (page-layout.md). */
export function paperForLanguage(
  language = typeof navigator === 'undefined' ? '' : navigator.language,
): PaperName {
  const region = language.split('-')[1]?.toUpperCase();
  return region === 'US' || region === 'CA' ? 'letter' : 'a4';
}

/** A change to the page: its setup over the whole document, its format, or both. */
export type PageChange = { readonly setup?: PageSetup; readonly pageless?: boolean };

/**
 * Sets the change over the whole document as one undo step (page-layout.md "Page setup", "Pageless"); answers how many
 * sections a setup set, 0 for none.
 */
export function applyPage(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  { setup, pageless }: PageChange,
): { sections: number } {
  startUndoStep(view);
  let sections = 0;
  if (setup) {
    const { width, height, orientation, margins } = setup;
    const tr = view.state.tr;
    sections = 1;
    view.state.doc.forEach((node, offset) => {
      if (node.type.name !== SECTION_BREAK) return;
      sections += 1;
      const own = (node.attrs.setup ?? {}) as Partial<PageSetup>;
      tr.setNodeAttribute(offset, 'setup', { ...own, width, height, orientation, margins });
    });
    if (tr.docChanged) view.dispatch(tr);
    TextDocumentState.setSection(
      doc,
      { ...TextDocumentState.section(doc, format), setup },
      TEXT_DOCUMENT_PAGE_ORIGIN,
    );
    debugLog('[text-document] page setup', { sections });
  }
  if (pageless !== undefined) {
    TextDocumentState.setPageless(doc, pageless, TEXT_DOCUMENT_PAGE_ORIGIN);
    debugLog('[text-document] pageless', { on: pageless });
  }
  startUndoStep(view);
  return { sections };
}
