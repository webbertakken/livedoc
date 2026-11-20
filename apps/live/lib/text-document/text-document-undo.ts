// A text document's undo (docs/specs/034-text-documents/live-editing-and-storage.md "Undo"): the person's own changes
// only (y-prosemirror's undo tracks the local origin), with typing within TEXT_DOCUMENT_UNDO_GROUP_MS one step.
import { Plugin } from 'prosemirror-state';
import { yUndoPlugin, yUndoPluginKey } from 'y-prosemirror';
import { TEXT_DOCUMENT_UNDO_GROUP_MS } from '@livedoc/text-documents';

export function textDocumentUndoPlugins(): Plugin[] {
  return [
    yUndoPlugin(),
    // The undo manager is made with the editor's state; its grouping is set once the view holds it.
    new Plugin({
      view: (view) => {
        const undoManager = yUndoPluginKey.getState(view.state)?.undoManager;
        if (undoManager) undoManager.captureTimeout = TEXT_DOCUMENT_UNDO_GROUP_MS;
        return {};
      },
    }),
  ];
}
