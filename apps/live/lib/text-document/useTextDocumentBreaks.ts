// Insert > Break on the open writing (docs/specs/034-text-documents/page-layout.md "Breaks"), for an Editor.
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
): OfficeActions {
  return useMemo(
    () => textDocumentBreakActions(view, { canEdit, liveDoc, format }),
    [view, canEdit, liveDoc, format],
  );
}
