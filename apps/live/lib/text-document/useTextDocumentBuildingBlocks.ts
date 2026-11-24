// Insert > Building blocks and its Code blocks on the open writing, for an Editor (docs/specs/034-text-documents/
// objects.md "Building blocks", "Code blocks"): the styles a block uses added to the document's live state, its new
// lists written on the undo timeline.
import { useMemo, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import {
  TextDocument,
  TextDocumentState,
  type ListDefinition,
  type Style,
} from '@livedoc/text-documents';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { buildingBlockActions } from './text-document-building-blocks';
import { codeBlockActions } from './text-document-code-blocks';
import { TEXT_DOCUMENT_LISTS_ORIGIN, TEXT_DOCUMENT_STYLES_ORIGIN } from './text-document-undo';

export function useTextDocumentBuildingBlocks(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  canEdit: boolean,
  // Points: the width a table at the caret takes (the caret's section's column).
  width: number,
): OfficeActions {
  return useMemo(() => {
    const readStyles = () =>
      liveDoc.current
        ? TextDocumentState.styles(liveDoc.current, format)
        : TextDocument.blank({ format }).styles;
    // Written with the format's set where the document still stands on it, on the undo timeline.
    const addStyle = (style: Style) => {
      if (liveDoc.current)
        TextDocumentState.setStyles(liveDoc.current, format, [style], TEXT_DOCUMENT_STYLES_ORIGIN);
    };
    return {
      ...buildingBlockActions({
        view,
        canEdit,
        width,
        format,
        readStyles,
        addStyle,
        lists: {
          read: () => (liveDoc.current ? TextDocumentState.lists(liveDoc.current) : {}),
          set: (id: string, list: ListDefinition) => {
            if (liveDoc.current)
              TextDocumentState.setList(liveDoc.current, id, list, TEXT_DOCUMENT_LISTS_ORIGIN);
          },
        },
      }),
      ...codeBlockActions({ view, canEdit, format, readStyles, addStyle }),
    };
  }, [view, liveDoc, format, canEdit, width]);
}
