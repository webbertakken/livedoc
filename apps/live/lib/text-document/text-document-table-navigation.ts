// Moving through a table by the keyboard (docs/specs/034-text-documents/tables.md "Working in a table";
// keyboard-shortcuts.md "Table navigation"): Google's Ctrl+Alt+Shift+T sequences put the caret at the start of a cell
// (the table's first or last, its row's or column's, the next or previous one across or down), after the table, or in
// the next or previous table's first cell. A move that has nowhere to go leaves the caret where it is.
import type { Node as PmNode, ResolvedPos } from 'prosemirror-model';
import { Selection, TextSelection, type Command } from 'prosemirror-state';
import { TableMap } from 'prosemirror-tables';
import type { EditorView } from 'prosemirror-view';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { debugLog } from '@/lib/debug-log';

type Place = { readonly table: PmNode; readonly start: number; readonly map: TableMap };
type Cell = { readonly row: number; readonly column: number };

/** The table the caret is in (the innermost), its content's start and map; null outside one. */
function placeOf($pos: ResolvedPos): (Place & { readonly cell: Cell }) | null {
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).type.spec.tableRole !== 'table') continue;
    const table = $pos.node(d);
    const start = $pos.start(d);
    const map = TableMap.get(table);
    // In a cell's writing, or at a cell's edge (a cell selection's head).
    const cellPos = ($pos.depth >= d + 2 ? $pos.before(d + 2) : $pos.pos) - start;
    const rect = map.findCell(cellPos);
    return { table, start, map, cell: { row: rect.top, column: rect.left } };
  }
  return null;
}

/** The caret at the start of the cell at a grid place. */
const toCell =
  (place: Place, target: Cell): Command =>
  (state, dispatch) => {
    const { map, start } = place;
    const row = Math.max(0, Math.min(map.height - 1, target.row));
    const column = Math.max(0, Math.min(map.width - 1, target.column));
    const pos = start + map.map[row * map.width + column]!;
    dispatch?.(state.tr.setSelection(Selection.near(state.doc.resolve(pos + 1))).scrollIntoView());
    return true;
  };

/** A move within the caret's table, from its cell to the place `to` names. */
const within =
  (to: (cell: Cell, map: TableMap) => Cell): Command =>
  (state, dispatch, view) => {
    const place = placeOf(state.selection.$head);
    if (!place) return false;
    return toCell(place, to(place.cell, place.map))(state, dispatch, view);
  };

/** The caret after the caret's table, else before it. */
export const exitTable: Command = (state, dispatch) => {
  const place = placeOf(state.selection.$head);
  if (!place) return false;
  const after = place.start - 1 + place.table.nodeSize;
  const $after = state.doc.resolve(after);
  const next = Selection.findFrom($after, 1, true) ?? Selection.findFrom($after, -1, true);
  if (!next) return false;
  dispatch?.(state.tr.setSelection(next).scrollIntoView());
  return true;
};

/** The caret in the first cell of the next (1) or previous (-1) table in the document. */
const toTable =
  (direction: 1 | -1): Command =>
  (state, dispatch) => {
    const here = state.selection.head;
    const own = placeOf(state.selection.$head);
    const tables: number[] = [];
    state.doc.descendants((node, pos) => {
      if (node.type.spec.tableRole === 'table') tables.push(pos);
    });
    const ownPos = own ? own.start - 1 : null;
    const found =
      direction === 1
        ? tables.find((pos) => pos > here && pos !== ownPos)
        : tables.filter((pos) => pos < (ownPos ?? here) && pos !== ownPos).pop();
    if (found === undefined) return false;
    dispatch?.(
      state.tr.setSelection(TextSelection.near(state.doc.resolve(found + 4))).scrollIntoView(),
    );
    return true;
  };

/** Each Table navigation row, by its id, and its move. */
export const TABLE_NAVIGATION: Readonly<Record<string, Command>> = {
  'move-to-the-start-of-the-table': within(() => ({ row: 0, column: 0 })),
  'move-to-the-end-of-the-table': within((_cell, map) => ({
    row: map.height - 1,
    column: map.width - 1,
  })),
  'move-to-the-start-of-the-table-column': within((cell) => ({ row: 0, column: cell.column })),
  'move-to-the-end-of-the-table-column': within((cell, map) => ({
    row: map.height - 1,
    column: cell.column,
  })),
  'move-to-the-next-table-column': within((cell) => ({ row: cell.row, column: cell.column + 1 })),
  'move-to-the-previous-table-column': within((cell) => ({
    row: cell.row,
    column: cell.column - 1,
  })),
  'move-to-the-start-of-the-table-row': within((cell) => ({ row: cell.row, column: 0 })),
  'move-to-the-end-of-the-table-row': within((cell, map) => ({
    row: cell.row,
    column: map.width - 1,
  })),
  'move-to-the-next-table-row': within((cell) => ({ row: cell.row + 1, column: cell.column })),
  'move-to-the-previous-table-row': within((cell) => ({ row: cell.row - 1, column: cell.column })),
  'exit-table': exitTable,
  'move-to-the-next-table': toTable(1),
  'move-to-the-previous-table': toTable(-1),
};

/** The rows' actions, for anyone who reads the document: moving changes nothing. */
export function textDocumentTableNavigation(view: EditorView | null): OfficeActions {
  if (!view) return {};
  return Object.fromEntries(
    Object.entries(TABLE_NAVIGATION).map(([id, command]) => [
      id,
      {
        run: () => {
          if (view.isDestroyed) return;
          const moved = command(view.state, view.dispatch);
          debugLog('[text-document] table-move', { move: id, moved });
          view.focus();
        },
      },
    ]),
  );
}
