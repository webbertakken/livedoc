// Insert > Building blocks on the open writing, for an Editor (docs/specs/034-text-documents/objects.md "Building
// blocks"): the styles a block uses added to the document's live state, its new lists written on the undo timeline.
import { useMemo, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import { TextDocument, TextDocumentState, type ListDefinition } from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { buildingBlockActions } from './text-document-building-blocks';
import { TEXT_DOCUMENT_LISTS_ORIGIN } from './text-document-undo';

export function useTextDocumentBuildingBlocks(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  canEdit: boolean,
  // Points: the width a table at the caret takes (the caret's section's column).
  width: number,
): OfficeActions {
  return useMemo(
    () =>
      buildingBlockActions({
        view,
        canEdit,
        width,
        format,
        readStyles: () =>
          liveDoc.current
            ? TextDocumentState.styles(liveDoc.current, format)
            : TextDocument.blank({ format }).styles,
        addStyle: (style) => {
          if (liveDoc.current) TextDocumentState.addStyle(liveDoc.current, style);
        },
        lists: {
          read: () => (liveDoc.current ? TextDocumentState.lists(liveDoc.current) : {}),
          set: (id: string, list: ListDefinition) => {
            if (liveDoc.current)
              TextDocumentState.setList(liveDoc.current, id, list, TEXT_DOCUMENT_LISTS_ORIGIN);
          },
        },
      }),
    [view, liveDoc, format, canEdit, width],
  );
}
