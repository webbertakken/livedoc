// Insert > Table, Format > Table and the cell context menu's table items on the open writing
// (docs/specs/034-text-documents/tables.md "Inserting", "Working in a table"), for an Editor.
import { useMemo } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { textDocumentTableEditActions } from './text-document-table-actions';
import { textDocumentTableActions } from './text-document-tables';

export function useTextDocumentTables(
  view: EditorView | null,
  canEdit: boolean,
  // The caret's section's text width in points (its column's in a section of columns).
  sectionWidth: number,
): OfficeActions {
  return useMemo(
    () => ({
      ...textDocumentTableActions(view, { canEdit, sectionWidth }),
      ...textDocumentTableEditActions(view, { canEdit }),
    }),
    [view, canEdit, sectionWidth],
  );
}
