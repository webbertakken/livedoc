'use client';

// The lists the surface binds (docs/specs/034-text-documents/lists.md): the list actions and the list buttons' grids
// over the editor there is now, reading and writing list definitions in the live state (a new one on the same undo
// step as the paragraphs joining it), and Restart numbering's dialog.
import { useMemo, useState, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import { textDocumentListActions } from '@/lib/text-document/text-document-list-actions';
import { startUndoStep, TEXT_DOCUMENT_LISTS_ORIGIN } from '@/lib/text-document/text-document-undo';
import { listsReader } from '@/lib/text-document/text-document-live-lists';
import { TextDocumentRestartNumberingDialog } from './TextDocumentRestartNumberingDialog';

export function useTextDocumentLists(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  canEdit: boolean,
) {
  // The number Restart numbering opened at; null while it is closed.
  const [restarting, setRestarting] = useState<number | null>(null);
  const bound = useMemo(
    () =>
      textDocumentListActions(
        view,
        {
          read: listsReader(liveDoc),
          set: (id, list) => {
            if (liveDoc.current)
              TextDocumentState.setList(liveDoc.current, id, list, TEXT_DOCUMENT_LISTS_ORIGIN);
          },
          startStep: () => {
            if (view) startUndoStep(view);
          },
        },
        { canEdit, openRestart: setRestarting },
      ),
    [view, liveDoc, canEdit],
  );
  const close = () => {
    setRestarting(null);
    if (view && !view.isDestroyed) view.focus();
  };
  const dialog =
    restarting !== null && bound.restart ? (
      <TextDocumentRestartNumberingDialog
        open
        start={restarting}
        onClose={close}
        onApply={(start) => {
          bound.restart?.(start);
          close();
        }}
      />
    ) : null;
  return { ...bound, dialog };
}
