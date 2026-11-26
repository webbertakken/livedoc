// Insert > Break on the open writing (docs/specs/034-text-documents/page-layout.md "Breaks"), for an Editor, and its
// page and column breaks for whoever suggests (review.md "Breaks and lines").
import { useMemo, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import type * as Y from 'yjs';
import type { TextDocumentFormat } from '@livedoc/document';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { textDocumentBreakActions } from './text-document-breaks';

export function useTextDocumentBreaks(
  view: EditorView | null,
  liveDoc: RefObject<Y.Doc | null>,
  format: TextDocumentFormat,
  canEdit: boolean,
  // Writing as suggestions: page and column breaks alone.
  suggests: boolean,
  // The caret's section's columns: Column break is dimmed with one.
  columns = 1,
): OfficeActions {
  return useMemo(
    () => textDocumentBreakActions(view, { canEdit, suggests, liveDoc, format, columns }),
    [view, canEdit, suggests, liveDoc, format, columns],
  );
}
