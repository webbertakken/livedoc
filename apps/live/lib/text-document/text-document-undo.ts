// A text document's undo (docs/specs/034-text-documents/live-editing-and-storage.md "Undo"): the person's own changes
// only (y-prosemirror's undo tracks the local origin), with typing within TEXT_DOCUMENT_UNDO_GROUP_MS one step. The
// document's styles, lists and page setup are on the same timeline: a change to them made with
// TEXT_DOCUMENT_STYLES_ORIGIN, TEXT_DOCUMENT_LISTS_ORIGIN or TEXT_DOCUMENT_PAGE_ORIGIN is undone with the rest.
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { yUndoPlugin, yUndoPluginKey } from 'y-prosemirror';
import { TEXT_DOCUMENT_UNDO_GROUP_MS, TextDocumentState } from '@livedoc/text-documents';

/** The origin a person's change to the document's styles is made with, so undo takes it back. */
export const TEXT_DOCUMENT_STYLES_ORIGIN = Symbol('text-document-styles');
/** The origin a person's change to the page's setup is made with (page-layout.md "Page setup"). */
export const TEXT_DOCUMENT_PAGE_ORIGIN = Symbol('text-document-page');
/** The origin a person's change to the document's lists is made with (lists.md "Making a list"). */
export const TEXT_DOCUMENT_LISTS_ORIGIN = Symbol('text-document-lists');

export function textDocumentUndoPlugins(): Plugin[] {
  return [
    yUndoPlugin(),
    // The undo manager is made with the editor's state; its grouping and scope are set once the view holds it.
    new Plugin({
      view: (view) => {
        const undoManager = yUndoPluginKey.getState(view.state)?.undoManager;
        if (undoManager) {
          undoManager.captureTimeout = TEXT_DOCUMENT_UNDO_GROUP_MS;
          undoManager.addToScope(TextDocumentState.stylesType(undoManager.doc));
          undoManager.addTrackedOrigin(TEXT_DOCUMENT_STYLES_ORIGIN);
          undoManager.addToScope(TextDocumentState.listsType(undoManager.doc));
          undoManager.addTrackedOrigin(TEXT_DOCUMENT_LISTS_ORIGIN);
          undoManager.addToScope(TextDocumentState.metaType(undoManager.doc));
          undoManager.addTrackedOrigin(TEXT_DOCUMENT_PAGE_ORIGIN);
        }
        return {};
      },
    }),
  ];
}

/** Ends the undo step being gathered, so the change that follows is a step of its own. */
export function startUndoStep(view: EditorView): void {
  yUndoPluginKey.getState(view.state)?.undoManager.stopCapturing();
}
