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
  unmergeTableCell,
} from './text-document-table-edits';
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

/** Each item: its id, its change's telemetry name, and its command. */
export const TABLE_EDIT_ITEMS: readonly {
  readonly item: string;
  readonly telemetry: string;
  readonly command: (view: EditorView) => Command;
}[] = [
  { item: 'table-insert-row-above', telemetry: 'InsertRow', command: () => insertRows('above') },
  { item: 'table-insert-row-below', telemetry: 'InsertRow', command: () => insertRows('below') },
  {
    item: 'table-insert-column-left',
    telemetry: 'InsertColumn',
    command: () => insertColumns('left'),
  },
  {
    item: 'table-insert-column-right',
    telemetry: 'InsertColumn',
    command: () => insertColumns('right'),
  },
  { item: 'table-delete-row', telemetry: 'DeleteRow', command: () => deleteRows },
  { item: 'table-delete-column', telemetry: 'DeleteColumn', command: () => deleteColumns },
  { item: 'table-delete', telemetry: 'Delete', command: () => deleteWholeTable },
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
];

export function textDocumentTableEditActions(
  view: EditorView | null,
  { canEdit }: { canEdit: boolean },
): OfficeActions {
  if (!view || !canEdit) return {};
  const actions: Record<string, OfficeAction> = {};
  for (const { item, telemetry, command } of TABLE_EDIT_ITEMS)
    actions[item] = {
      run: () => {
        if (view.isDestroyed) return;
        const own = command(view);
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
        return view.isDestroyed || !command(view)(view.state);
      },
    };
  return actions;
}
