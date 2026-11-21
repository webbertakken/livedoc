// Insert > Table, Format > Table and the cell context menu's table items on the open writing, for an Editor, and the
// Table navigation shortcuts, for anyone (docs/specs/034-text-documents/tables.md "Inserting", "Working in a table").
import { useMemo } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { textDocumentTableEditActions } from './text-document-table-actions';
import { textDocumentTableActions } from './text-document-tables';
import { textDocumentTableNavigation } from './text-document-table-navigation';

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
      // Moving through tables is anyone's who reads the document (tables.md "Working in a table").
      ...textDocumentTableNavigation(view),
    }),
    [view, canEdit, sectionWidth],
  );
}
