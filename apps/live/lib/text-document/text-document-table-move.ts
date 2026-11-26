// Moving a table's rows and columns (docs/specs/034-text-documents/tables.md "Working in a table", Move): the caret's
// row or column, or the selected ones as a block, moves past its neighbour. The neighbour is what is taken out and put
// back on the far side, so the rows or cells moved are never re-made: the caret and a cell selection stay in them.
import { Selection, type Command, type EditorState } from 'prosemirror-state';
import { TableMap, isInTable, selectedRect } from 'prosemirror-tables';
import { headerRowsOf, reshaping } from './text-document-table-edits';

// Whether every cell in rows `from` to `to` (inclusive) starts and ends in its own row.
function rowsWhole(map: TableMap, from: number, to: number): boolean {
  for (let r = from; r <= to; r++)
    for (let c = 0; c < map.width; c++) {
      const own = map.findCell(map.map[r * map.width + c]!);
      if (own.top !== r || own.bottom !== r + 1) return false;
    }
  return true;
}

// Whether every cell in columns `from` to `to` (inclusive) starts and ends in its own column.
function columnsWhole(map: TableMap, from: number, to: number): boolean {
  for (let r = 0; r < map.height; r++)
    for (let c = from; c <= to; c++) {
      const own = map.findCell(map.map[r * map.width + c]!);
      if (own.left !== c || own.right !== c + 1) return false;
    }
  return true;
}

/** Move the caret's row (or the selected rows) up or down past its neighbour, within the header rows or below them. */
export const moveRows =
  (direction: 'up' | 'down'): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    const { top, bottom, map, table, tableStart } = selectedRect(state);
    const neighbour = direction === 'up' ? top - 1 : bottom;
    if (neighbour < 0 || neighbour >= map.height) return false;
    const header = headerRowsOf(table);
    if (top < header !== neighbour < header || (top < header && bottom > header)) return false;
    if (!rowsWhole(map, Math.min(top, neighbour), Math.max(bottom - 1, neighbour))) return false;
    if (!dispatch) return true;
    const rowStart = (index: number) => {
      let pos = tableStart;
      for (let r = 0; r < index; r++) pos += table.child(r).nodeSize;
      return pos;
    };
    const moved = table.child(neighbour);
    const tr = state.tr;
    tr.delete(rowStart(neighbour), rowStart(neighbour) + moved.nodeSize);
    tr.insert(tr.mapping.map(rowStart(direction === 'up' ? bottom : top)), moved);
    dispatch(reshaping(tr).scrollIntoView());
    return true;
  };

/** Move the caret's column (or the selected columns) left or right past its neighbour, its width with it. */
export const moveColumns =
  (direction: 'left' | 'right'): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    const { left, right, map, table, tableStart } = selectedRect(state);
    const neighbour = direction === 'left' ? left - 1 : right;
    if (neighbour < 0 || neighbour >= map.width) return false;
    if (!columnsWhole(map, Math.min(left, neighbour), Math.max(right - 1, neighbour))) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    for (let r = 0; r < map.height; r++) {
      const at = map.map[r * map.width + neighbour]!;
      const cell = table.nodeAt(at)!;
      // The far side of the block: after its last cell going left, before its first going right.
      const far =
        direction === 'left'
          ? map.map[r * map.width + right - 1]! +
            table.nodeAt(map.map[r * map.width + right - 1]!)!.nodeSize
          : map.map[r * map.width + left]!;
      const from = tr.mapping.map(tableStart + at);
      tr.delete(from, from + cell.nodeSize);
      tr.insert(tr.mapping.map(tableStart + far), cell);
    }
    dispatch(reshaping(tr).scrollIntoView());
    return true;
  };

// The table at `tableStart` (inside it) in the state's document, with its map.
function tableAt(state: EditorState, tableStart: number) {
  const table = state.doc.resolve(tableStart).parent;
  return table.type.spec.tableRole === 'table' ? { table, map: TableMap.get(table) } : null;
}

/**
 * Move row `from` of the table at `tableStart` to stand before row `to` (its row count for the end), as a drag drops
 * it; the caret goes to its first cell. Refused beside itself, across the header rows' boundary, or across a span.
 */
export const moveRowTo =
  (tableStart: number, from: number, to: number): Command =>
  (state, dispatch) => {
    const found = tableAt(state, tableStart);
    if (!found) return false;
    const { table, map } = found;
    if (
      from < 0 ||
      from >= map.height ||
      to < 0 ||
      to > map.height ||
      to === from ||
      to === from + 1
    )
      return false;
    const header = headerRowsOf(table);
    const landing = to > from ? to - 1 : to;
    if (from < header !== landing < header) return false;
    if (!rowsWhole(map, Math.min(from, to), Math.max(from, to - 1))) return false;
    if (!dispatch) return true;
    const rowStart = (index: number) => {
      let pos = tableStart;
      for (let r = 0; r < index; r++) pos += table.child(r).nodeSize;
      return pos;
    };
    const moved = table.child(from);
    const tr = state.tr;
    tr.delete(rowStart(from), rowStart(from) + moved.nodeSize);
    const at = tr.mapping.map(rowStart(to));
    tr.insert(at, moved);
    tr.setSelection(Selection.near(tr.doc.resolve(at + 1)));
    dispatch(reshaping(tr).scrollIntoView());
    return true;
  };

/** Move column `from` of the table at `tableStart` to stand before column `to`, its width with it. */
export const moveColumnTo =
  (tableStart: number, from: number, to: number): Command =>
  (state, dispatch) => {
    const found = tableAt(state, tableStart);
    if (!found) return false;
    const { table, map } = found;
    if (from < 0 || from >= map.width || to < 0 || to > map.width || to === from || to === from + 1)
      return false;
    if (!columnsWhole(map, Math.min(from, to), Math.max(from, to - 1))) return false;
    if (!dispatch) return true;
    const tr = state.tr;
    let first = -1;
    for (let r = 0; r < map.height; r++) {
      const at = map.map[r * map.width + from]!;
      const cell = table.nodeAt(at)!;
      // Before column `to`'s cell, or after the row's last.
      const before =
        to < map.width
          ? map.map[r * map.width + to]!
          : map.map[r * map.width + map.width - 1]! +
            table.nodeAt(map.map[r * map.width + map.width - 1]!)!.nodeSize;
      const own = tr.mapping.map(tableStart + at);
      tr.delete(own, own + cell.nodeSize);
      const put = tr.mapping.map(tableStart + before);
      tr.insert(put, cell);
      if (first < 0) first = put;
    }
    tr.setSelection(Selection.near(tr.doc.resolve(first + 1)));
    dispatch(reshaping(tr).scrollIntoView());
    return true;
  };
