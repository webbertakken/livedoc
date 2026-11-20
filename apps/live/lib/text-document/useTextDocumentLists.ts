// The lists the surface binds (docs/specs/034-text-documents/lists.md): the list actions over the editor there is now,
// reading and adding list definitions in the live state, a new one on the same undo step as the paragraphs joining it.
import { useMemo, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import { textDocumentListActions } from './text-document-list-actions';
import { startUndoStep, TEXT_DOCUMENT_LISTS_ORIGIN } from './text-document-undo';
import type { Lists } from './text-document-lists';

/** Reads the live state's lists; none before it is bound. */
export const listsReader = (liveDoc: RefObject<Y.Doc | null>) => (): Lists =>
  liveDoc.current ? TextDocumentState.lists(liveDoc.current) : {};

/** Tells `listener` of any change to the live state's lists, by anyone. */
export function subscribeLists(doc: Y.Doc, listener: () => void): () => void {
  const lists = TextDocumentState.listsType(doc);
  lists.observe(listener);
  return () => lists.unobserve(listener);
}

export function useTextDocumentLists(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  canEdit: boolean,
) {
  return useMemo(
    () =>
      textDocumentListActions(
        view,
        {
          read: listsReader(liveDoc),
          add: (id, list) => {
            if (liveDoc.current)
              TextDocumentState.setList(liveDoc.current, id, list, TEXT_DOCUMENT_LISTS_ORIGIN);
          },
          startStep: () => {
            if (view) startUndoStep(view);
          },
        },
        { canEdit },
      ),
    [view, liveDoc, canEdit],
  );
}
