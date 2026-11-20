// Page setup applied (docs/specs/034-text-documents/page-layout.md "Page setup"): the paper a new document starts on
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

/** Sets `setup` over the whole document, one undo step; answers how many sections it set. */
export function applyPageSetup(
  view: EditorView,
  doc: Y.Doc,
  format: TextDocumentFormat,
  setup: PageSetup,
): { sections: number } {
  const { width, height, orientation, margins } = setup;
  startUndoStep(view);
  const tr = view.state.tr;
  let sections = 1;
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
  startUndoStep(view);
  debugLog('[text-document] page setup', { sections });
  return { sections };
}
