// Reshaping a table (docs/specs/034-text-documents/tables.md "Working in a table"): rows and columns inserted like the
// caret's, deleted, distributed; cells merged and unmerged; the table deleted. Columns' widths stay on every cell
// (`colwidth`), the table keeping its width where the spec says so. Each is one command, one undo step.
import type { Node as PmNode } from 'prosemirror-model';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import {
  addColumn,
  CellSelection,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  mergeCells,
  selectedRect,
  splitCell,
  TableMap,
  type TableRect,
} from 'prosemirror-tables';
import {
  TEXT_DOCUMENT_TABLE_MAX_COLUMNS,
  TEXT_DOCUMENT_TABLE_MAX_ROWS,
} from '@livedoc/text-documents';
import { columnWidths } from './text-document-table-dom';

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Set on a transaction that moves, sorts, distributes, merges or splits a table's rows, columns or cells: while
 * suggesting it runs only inside one's own suggested block (review.md "Not yet"), never read as rows and cells added and
 * taken out.
 */
export const TABLE_RESHAPE_META = 'textDocumentTableReshape';

/** `tr` marked a reshape. */
export const reshaping = (tr: Transaction): Transaction => tr.setMeta(TABLE_RESHAPE_META, true);

/** The table at the caret, as `prosemirror-tables` reads it; null outside a table. */
const rectOf = (state: EditorState): TableRect | null =>
  isInTable(state) ? selectedRect(state) : null;

/** Every cell's `colwidth` set from `widths`, one per grid column, in the transaction's table at `tableStart`. */
export function setColumnWidths(
  tr: Transaction,
  tableStart: number,
  widths: readonly number[],
): void {
  const table = tr.doc.nodeAt(tableStart - 1)!;
  const map = TableMap.get(table);
  const seen = new Set<number>();
  for (const pos of map.map) {
    if (seen.has(pos)) continue;
    seen.add(pos);
    const cell = table.nodeAt(pos)!;
    const { left, right } = map.findCell(pos);
    tr.setNodeMarkup(tableStart + pos, null, {
      ...cell.attrs,
      colwidth: widths.slice(left, right).map(round),
    });
  }
}

/** The `count` new columns from grid column `index`: each of their own cells `width` wide, no other cell touched. */
function newColumnWidths(
  tr: Transaction,
  tableStart: number,
  index: number,
  count: number,
  width: number,
): void {
  const table = tr.doc.nodeAt(tableStart - 1)!;
  const map = TableMap.get(table);
  for (let row = 0; row < map.height; row++)
    for (let column = index; column < index + count; column++) {
      const pos = map.map[row * map.width + column]!;
      const cell = table.nodeAt(pos)!;
      if ((cell.attrs.colspan as number) > 1) continue;
      tr.setNodeMarkup(tableStart + pos, null, { ...cell.attrs, colwidth: [round(width)] });
    }
}

/** The widths scaled so they sum to `total`. */
const scaledTo = (widths: readonly number[], total: number): number[] => {
  const sum = widths.reduce((a, b) => a + b, 0);
  return sum > 0 ? widths.map((w) => (w * total) / sum) : widths.map(() => total / widths.length);
};

/** A new row at grid row `index`, like row `like`: its cells' columns, lines and shading, empty, one row high. */
function insertRowAt(tr: Transaction, tableStart: number, index: number, like: number): void {
  const table = tr.doc.nodeAt(tableStart - 1)!;
  const map = TableMap.get(table);
  const { width, height } = map;
  const cells: PmNode[] = [];
  const grown = new Set<number>();
  let previous = -1;
  for (let col = 0; col < width; col++) {
    // A cell spanning down across the place grows by the row.
    if (index > 0 && index < height) {
      const above = map.map[(index - 1) * width + col]!;
      if (above === map.map[index * width + col]) {
        if (!grown.has(above)) {
          grown.add(above);
          const cell = table.nodeAt(above)!;
          tr.setNodeMarkup(tableStart + above, null, {
            ...cell.attrs,
            rowspan: (cell.attrs.rowspan as number) + 1,
          });
        }
        previous = -1;
        continue;
      }
    }
    const pos = map.map[like * width + col]!;
    const source = table.nodeAt(pos)!;
    const last = cells[cells.length - 1];
    if (pos === previous && last) {
      const attrs = last.attrs as { colspan: number; colwidth: number[] | null };
      const widths = columnWidths(table);
      cells[cells.length - 1] = last.type.create(
        {
          ...attrs,
          colspan: attrs.colspan + 1,
          colwidth: [...(attrs.colwidth ?? []), widths[col]!],
        },
        last.content,
      );
      continue;
    }
    previous = pos;
    const own = (source.attrs.colwidth as number[] | null)?.[col - map.findCell(pos).left];
    cells.push(
      source.type.create(
        { ...source.attrs, colspan: 1, rowspan: 1, colwidth: own === undefined ? null : [own] },
        source.type.schema.nodes.paragraph!.create(source.firstChild?.attrs ?? null),
      ),
    );
  }
  // The row goes before grid row `index`'s row node, or at the table's end.
  let at = tableStart;
  for (let r = 0; r < index; r++) at += table.child(r).nodeSize;
  const likeRow = table.child(Math.min(like, table.childCount - 1));
  tr.insert(at, likeRow.type.create({ ...likeRow.attrs, height: null, heightRule: null }, cells));
}

/** Insert rows above the caret's or the selection's first row, or below its last; as many as it spans. */
export const insertRows =
  (side: 'above' | 'below'): Command =>
  (state, dispatch) => {
    const rect = rectOf(state);
    if (!rect) return false;
    const count = rect.bottom - rect.top;
    if (rect.map.height + count > TEXT_DOCUMENT_TABLE_MAX_ROWS) return false;
    if (dispatch) {
      const tr = state.tr;
      const like = side === 'above' ? rect.top : rect.bottom - 1;
      const index = side === 'above' ? rect.top : rect.bottom;
      // Each like the row it is beside; every insert at the same place pushes the earlier ones on.
      for (let i = 0; i < count; i++)
        insertRowAt(tr, rect.tableStart, index, side === 'above' ? like + i : like);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/**
 * Insert columns left of the caret's or the selection's first column, or right of its last; the table keeps its width,
 * or, with `keepWidths` (while suggesting), grows by the new columns, each its neighbour's width, no other cell
 * changed, so rejecting them gives the table back as it was (review.md "Rows and columns").
 */
export const insertColumns =
  (side: 'left' | 'right', { keepWidths = false }: { keepWidths?: boolean } = {}): Command =>
  (state, dispatch) => {
    const rect = rectOf(state);
    if (!rect) return false;
    const count = rect.right - rect.left;
    if (rect.map.width + count > TEXT_DOCUMENT_TABLE_MAX_COLUMNS) return false;
    if (dispatch) {
      const tr = state.tr;
      const before = columnWidths(rect.table);
      const total = before.reduce((a, b) => a + b, 0);
      const like = side === 'left' ? rect.left : rect.right - 1;
      const index = side === 'left' ? rect.left : rect.right;
      const widths = [...before];
      for (let i = 0; i < count; i++) {
        const table = tr.doc.nodeAt(rect.tableStart - 1)!;
        const map = TableMap.get(table);
        addColumn(tr, { ...rect, table, map }, index);
        // The new cells take the like column's lines and shading.
        const after = tr.doc.nodeAt(rect.tableStart - 1)!;
        const next = TableMap.get(after);
        const source = side === 'left' ? like + 1 + i : like;
        for (let row = 0; row < next.height; row++) {
          const pos = next.map[row * next.width + index]!;
          const cell = after.nodeAt(pos)!;
          if ((cell.attrs.colspan as number) > 1) continue;
          const from = after.nodeAt(next.map[row * next.width + source]!)!;
          tr.setNodeMarkup(rect.tableStart + pos, null, {
            ...cell.attrs,
            props: from.attrs.props as unknown,
          });
        }
        widths.splice(index, 0, before[like]!);
      }
      if (keepWidths) newColumnWidths(tr, rect.tableStart, index, count, before[like]!);
      else setColumnWidths(tr, rect.tableStart, scaledTo(widths, total));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/** Delete the rows the caret or selection spans; every row deletes the table. */
export const deleteRows: Command = (state, dispatch) => {
  const rect = rectOf(state);
  if (!rect) return false;
  if (rect.top === 0 && rect.bottom === rect.map.height) return deleteTable(state, dispatch);
  return deleteRow(state, dispatch);
};

/** Delete the columns the caret or selection spans, the others keeping their widths; every column deletes the table. */
export const deleteColumns: Command = (state, dispatch) => {
  const rect = rectOf(state);
  if (!rect) return false;
  if (rect.left === 0 && rect.right === rect.map.width) return deleteTable(state, dispatch);
  return deleteColumn(state, dispatch);
};

/** Delete the table the caret is in. */
export const deleteWholeTable: Command = (state, dispatch) =>
  isInTable(state) && deleteTable(state, dispatch);

/** The rows or columns to distribute: a cell selection's, else every one. */
const spanned = (state: EditorState, rect: TableRect, axis: 'rows' | 'columns') => {
  const whole = !(state.selection instanceof CellSelection);
  if (axis === 'columns')
    return whole ? { from: 0, to: rect.map.width } : { from: rect.left, to: rect.right };
  return whole ? { from: 0, to: rect.map.height } : { from: rect.top, to: rect.bottom };
};

/** Share the spanned columns' widths equally, the table keeping its width. */
export const distributeColumns: Command = (state, dispatch) => {
  const rect = rectOf(state);
  if (!rect) return false;
  if (dispatch) {
    const { from, to } = spanned(state, rect, 'columns');
    const widths = columnWidths(rect.table);
    const share = widths.slice(from, to).reduce((a, b) => a + b, 0) / (to - from);
    const tr = state.tr;
    setColumnWidths(
      tr,
      rect.tableStart,
      widths.map((w, i) => (i >= from && i < to ? share : w)),
    );
    dispatch(reshaping(tr));
  }
  return true;
};

/** Give the spanned rows the tallest one's height as their minimum; `heightOf` reads a row's drawn height in points. */
export const distributeRows =
  (heightOf: (rowPos: number) => number): Command =>
  (state, dispatch) => {
    const rect = rectOf(state);
    if (!rect) return false;
    if (dispatch) {
      const { from, to } = spanned(state, rect, 'rows');
      const positions: number[] = [];
      let at = rect.tableStart;
      rect.table.forEach((row, _offset, index) => {
        if (index >= from && index < to) positions.push(at);
        at += row.nodeSize;
      });
      const tallest = Math.max(0, ...positions.map(heightOf));
      const tr = state.tr;
      for (const pos of positions) {
        const row = state.doc.nodeAt(pos)!;
        tr.setNodeMarkup(pos, null, { ...row.attrs, height: round(tallest), heightRule: null });
      }
      dispatch(reshaping(tr));
    }
    return true;
  };

/** A table command whose cells' widths are set again from the columns' afterwards: the library's leave gaps. */
const keepingWidths =
  (command: Command): Command =>
  (state, dispatch, view) => {
    const rect = rectOf(state);
    if (!rect) return false;
    const widths = columnWidths(rect.table);
    return command(
      state,
      dispatch &&
        ((tr) => {
          setColumnWidths(tr, rect.tableStart, widths);
          dispatch(reshaping(tr));
        }),
      view,
    );
  };

/** Merge a selection of two or more cells forming a rectangle. */
export const mergeTableCells: Command = (state, dispatch, view) =>
  state.selection instanceof CellSelection && keepingWidths(mergeCells)(state, dispatch, view);

/** Split the caret's merged cell back into one cell per place. */
export const unmergeTableCell: Command = keepingWidths(splitCell);

/** The table's header rows: its leading rows whose cells are all header cells. */
export function headerRowsOf(table: PmNode): number {
  let count = 0;
  for (let r = 0; r < table.childCount; r++) {
    let all = table.child(r).childCount > 0;
    table.child(r).forEach((cell) => {
      if (cell.type.spec.tableRole !== 'header_cell') all = false;
    });
    if (!all) break;
    count += 1;
  }
  return count;
}

/** Make the table's first `count` rows its header rows (pinned), the rest body rows; at least one body row stays. */
export const pinHeaderRows =
  (count: number): Command =>
  (state, dispatch) => {
    const rect = rectOf(state);
    if (!rect || count < 0 || count >= rect.table.childCount) return false;
    if (dispatch) {
      const { schema } = state;
      const tr = state.tr;
      let at = rect.tableStart;
      rect.table.forEach((row, _offset, index) => {
        let cellAt = at + 1;
        row.forEach((cell) => {
          const type = index < count ? schema.nodes.table_header! : schema.nodes.table_cell!;
          if (cell.type !== type) tr.setNodeMarkup(cellAt, type, cell.attrs);
          cellAt += cell.nodeSize;
        });
        at += row.nodeSize;
      });
      dispatch(tr);
    }
    return true;
  };

// A cell's writing read as a number: digits with an optional sign, decimal point and thousands commas.
const NUMBER = /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Two cells' writing in sort order: numbers first in number order, then words, empty cells last (tables.md). */
export function compareCells(a: string, b: string): number {
  const x = a.trim();
  const y = b.trim();
  if (!x || !y) return x ? -1 : y ? 1 : 0;
  const nx = NUMBER.test(x) ? Number(x.replaceAll(',', '')) : null;
  const ny = NUMBER.test(y) ? Number(y.replaceAll(',', '')) : null;
  if (nx !== null && ny !== null) return nx - ny;
  if (nx !== null) return -1;
  if (ny !== null) return 1;
  return collator.compare(x, y);
}

/** Sort the rows below the header rows by the caret's column; refused where a body cell spans rows. */
export const sortTable =
  (direction: 'ascending' | 'descending'): Command =>
  (state, dispatch) => {
    const rect = rectOf(state);
    if (!rect) return false;
    const { table, map } = rect;
    const header = headerRowsOf(table);
    if (table.childCount - header < 2) return false;
    for (let r = header; r < table.childCount; r++) {
      let spans = false;
      table.child(r).forEach((cell) => {
        if ((cell.attrs.rowspan as number) > 1) spans = true;
      });
      if (spans) return false;
    }
    if (dispatch) {
      const keyOf = (r: number) => {
        const pos = map.map[r * map.width + rect.left]!;
        return table.nodeAt(pos)!.textContent;
      };
      const body = Array.from({ length: table.childCount - header }, (_, k) => header + k);
      const order = [...body].sort((a, b) => {
        const empty = (r: number) => keyOf(r).trim() === '';
        // Empty cells last whichever way.
        if (empty(a) !== empty(b)) return empty(a) ? 1 : -1;
        const c = compareCells(keyOf(a), keyOf(b));
        return direction === 'ascending' ? c : -c;
      });
      const rows: PmNode[] = [];
      for (let r = 0; r < header; r++) rows.push(table.child(r));
      for (const r of order) rows.push(table.child(r));
      const tr = state.tr.replaceWith(rect.tableStart, rect.tableStart + table.content.size, rows);
      dispatch(reshaping(tr));
    }
    return true;
  };
