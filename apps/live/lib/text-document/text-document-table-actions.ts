// Format > Table's and the cell context menu's items (docs/specs/034-text-documents/tables.md "Working in a table",
// "Format > Table", "Context menu"), for an Editor: each dimmed outside a table, Merge cells without a selection that can
// merge and Unmerge cells off a merged cell; each one undo step, tracked by its change's name.
import type { Command } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  deleteColumns,
  deleteRows,
  deleteWholeTable,
  distributeColumns,
  distributeRows,
  insertColumns,
  insertRows,
  mergeTableCells,
  pinHeaderRows,
  sortTable,
  unmergeTableCell,
} from './text-document-table-edits';
import { isInTable, selectedRect } from 'prosemirror-tables';
import { moveColumns, moveRows } from './text-document-table-move';
import { startUndoStep } from './text-document-undo';

// CSS pixels to points.
const PT_PER_PX = 72 / 96;

/** A row's drawn height in points, at the page's zoom. */
function drawnRowHeight(view: EditorView, rowPos: number): number {
  const row = view.nodeDOM(rowPos);
  if (!(row instanceof HTMLElement)) return 0;
  const body = view.dom.getBoundingClientRect();
  const width = Number.parseFloat(getComputedStyle(view.dom).width);
  const zoom = width > 0 && body.width > 0 ? body.width / width : 1;
  return (row.getBoundingClientRect().height / zoom) * PT_PER_PX;
}

/** The rows Pin up to row pins: the caret's or the selection's last; 0 outside a table. */
const pinnedUpTo = (view: EditorView): number =>
  isInTable(view.state) ? selectedRect(view.state).bottom : 0;

/** Each item: its id, its change's telemetry name, its command, and what it is called now where that changes. */
export const TABLE_EDIT_ITEMS: readonly {
  readonly item: string;
  readonly telemetry: string;
  /** Its command; `suggests`: the person is suggesting (a column added then grows the table, review.md). */
  readonly command: (view: EditorView, how: { readonly suggests: boolean }) => Command;
  readonly label?: (view: EditorView) => string | undefined;
}[] = [
  { item: 'table-insert-row-above', telemetry: 'InsertRow', command: () => insertRows('above') },
  { item: 'table-insert-row-below', telemetry: 'InsertRow', command: () => insertRows('below') },
  {
    item: 'table-insert-column-left',
    telemetry: 'InsertColumn',
    command: (_, { suggests }) => insertColumns('left', { keepWidths: suggests }),
  },
  {
    item: 'table-insert-column-right',
    telemetry: 'InsertColumn',
    command: (_, { suggests }) => insertColumns('right', { keepWidths: suggests }),
  },
  { item: 'table-delete-row', telemetry: 'DeleteRow', command: () => deleteRows },
  { item: 'table-delete-column', telemetry: 'DeleteColumn', command: () => deleteColumns },
  { item: 'table-delete', telemetry: 'Delete', command: () => deleteWholeTable },
  { item: 'table-move-row-up', telemetry: 'MoveRow', command: () => moveRows('up') },
  { item: 'table-move-row-down', telemetry: 'MoveRow', command: () => moveRows('down') },
  { item: 'table-move-column-left', telemetry: 'MoveColumn', command: () => moveColumns('left') },
  {
    item: 'table-move-column-right',
    telemetry: 'MoveColumn',
    command: () => moveColumns('right'),
  },
  {
    item: 'table-distribute-rows',
    telemetry: 'DistributeRows',
    command: (view) => distributeRows((pos) => drawnRowHeight(view, pos)),
  },
  {
    item: 'table-distribute-columns',
    telemetry: 'DistributeColumns',
    command: () => distributeColumns,
  },
  { item: 'table-merge-cells', telemetry: 'Merge', command: () => mergeTableCells },
  { item: 'table-unmerge-cells', telemetry: 'Unmerge', command: () => unmergeTableCell },
  { item: 'table-sort-ascending', telemetry: 'Sort', command: () => sortTable('ascending') },
  { item: 'table-sort-descending', telemetry: 'Sort', command: () => sortTable('descending') },
  { item: 'table-pin-none', telemetry: 'PinHeader', command: () => pinHeaderRows(0) },
  {
    item: 'table-pin-current',
    telemetry: 'PinHeader',
    command: (view) => pinHeaderRows(pinnedUpTo(view)),
    label: (view) => {
      const rows = pinnedUpTo(view);
      return rows > 0 ? `Pin up to row ${rows}` : undefined;
    },
  },
];

export function textDocumentTableEditActions(
  view: EditorView | null,
  { canEdit, suggests = false }: { canEdit: boolean; suggests?: boolean },
): OfficeActions {
  if (!view || !canEdit) return {};
  const how = { suggests };
  const actions: Record<string, OfficeAction> = {};
  for (const { item, telemetry, command, label } of TABLE_EDIT_ITEMS)
    actions[item] = {
      get label() {
        return view.isDestroyed ? undefined : label?.(view);
      },
      run: () => {
        if (view.isDestroyed) return;
        const own = command(view, how);
        // A step of its own: the writing before it and after it undo apart.
        startUndoStep(view);
        if (own(view.state, view.dispatch)) {
          startUndoStep(view);
          track('Element', 'Changed', `TextDocumentTable${telemetry}`);
          debugLog('[text-document] table', { change: item });
        }
        view.focus();
      },
      get disabled() {
        return view.isDestroyed || !command(view, how)(view.state);
      },
    };
  return actions;
}
