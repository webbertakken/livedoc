// A table's merged cells when settling takes rows or columns away (docs/specs/034-text-documents/review.md "Across
// merged cells"): every merged cell crossing a row or column taken away shrinks by one, its column widths with it, and
// one starting in a row taken away starts in the next row it spans, keeping its writing, after the cells before it
// there. Run before the rows and cells go, on the table as it stands, so the grid is read whole.
import * as Y from 'yjs';
import { TABLE_CELL, TABLE_HEADER, TABLE_ROW } from './live-names';

type Placed = { cell: Y.XmlElement; row: number; column: number; rows: number; columns: number };

const isRow = (node: unknown): node is Y.XmlElement =>
  node instanceof Y.XmlElement && node.nodeName === TABLE_ROW;
const isCell = (node: unknown): node is Y.XmlElement =>
  node instanceof Y.XmlElement && (node.nodeName === TABLE_CELL || node.nodeName === TABLE_HEADER);
const spanOf = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 1 ? value : 1;

/** Every cell where it stands in the table's grid, a merged cell over every place it covers. */
function placed(rows: readonly Y.XmlElement[]): {
  cells: Placed[];
  grid: (Placed | undefined)[][];
} {
  const grid: (Placed | undefined)[][] = rows.map(() => []);
  const cells: Placed[] = [];
  rows.forEach((row, r) => {
    let column = 0;
    for (const cell of row.toArray().filter(isCell)) {
      while (grid[r]![column]) column += 1;
      const place = {
        cell,
        row: r,
        column,
        rows: Math.min(spanOf(cell.getAttribute('rowspan')), rows.length - r),
        columns: spanOf(cell.getAttribute('colspan')),
      };
      cells.push(place);
      for (let dr = 0; dr < place.rows; dr += 1)
        for (let dc = 0; dc < place.columns; dc += 1) grid[r + dr]![column + dc] = place;
      column += place.columns;
    }
  });
  return { cells, grid };
}

/** A merged cell's attributes once what crosses it is taken away: its spans (1 for none) and, where kept, widths. */
export type SpanChange = { rowspan: number; colspan: number; colwidth?: unknown[] };

/** What taking rows and cells away does to a table's merged cells: each one's new spans, and the ones that move down. */
export type SpanPlan = {
  changes: Map<Y.XmlElement, SpanChange>;
  moves: { cell: Y.XmlElement; column: number; to: number }[];
  rows: Y.XmlElement[];
  cells: Placed[];
};

const NO_PLAN = (): SpanPlan => ({ changes: new Map(), moves: [], rows: [], cells: [] });

/** A span's attribute as stored: the number above one, else none. */
export const spanAttribute = (value: number): number | undefined => (value > 1 ? value : undefined);

/**
 * The merged cells crossing the rows and cells `goes` says are taken away: each one's new spans and widths, and one
 * starting in a row taken away moving into the next row it spans. Reads only.
 */
export function crossingSpans(
  table: Y.XmlElement,
  goes: (node: Y.XmlElement) => boolean,
): SpanPlan {
  const rows = table.toArray().filter(isRow);
  const { cells, grid } = placed(rows);
  if (!cells.some((p) => p.rows > 1 || p.columns > 1)) return NO_PLAN();
  const goneRows = new Set(rows.flatMap((row, r) => (goes(row) ? [r] : [])));
  const goneCell = (p: Placed) => goes(p.cell);
  const width = Math.max(0, ...grid.map((places) => places.length));
  // A column goes when, in every row that stays, its place is a cell taken away or a merged cell spanning on.
  const goneColumns = new Set<number>();
  for (let column = 0; column < width; column += 1) {
    let taken = false;
    let whole = true;
    rows.forEach((_, r) => {
      if (goneRows.has(r)) return;
      const p = grid[r]![column];
      if (p && goneCell(p) && p.columns === 1) taken = true;
      else if (!p || p.columns === 1) whole = false;
    });
    if (taken && whole) goneColumns.add(column);
  }
  const changes = new Map<Y.XmlElement, SpanChange>();
  const moves: SpanPlan['moves'] = [];
  for (const p of cells) {
    if (goneCell(p) || (p.rows === 1 && p.columns === 1)) continue;
    let keptRows = 0;
    let first = -1;
    for (let r = p.row; r < p.row + p.rows; r += 1)
      if (!goneRows.has(r)) {
        keptRows += 1;
        if (first < 0) first = r;
      }
    if (keptRows === 0) continue;
    const keptColumns: number[] = [];
    for (let c = p.column; c < p.column + p.columns; c += 1)
      if (!goneColumns.has(c)) keptColumns.push(c);
    if (keptColumns.length === p.columns && keptRows === p.rows) continue;
    const widths = p.cell.getAttribute('colwidth') as unknown;
    changes.set(p.cell, {
      rowspan: keptRows,
      colspan: keptColumns.length,
      ...(Array.isArray(widths) && keptColumns.length < p.columns
        ? { colwidth: keptColumns.map((c) => widths[c - p.column] as unknown) }
        : {}),
    });
    if (goneRows.has(p.row)) moves.push({ cell: p.cell, column: p.column, to: first });
  }
  return { changes, moves, rows, cells };
}

const setSpan = (cell: Y.XmlElement, name: 'rowspan' | 'colspan', value: number) => {
  if (value > 1) cell.setAttribute(name, value as unknown as string);
  else if (cell.getAttribute(name) !== undefined) cell.removeAttribute(name);
};

/**
 * Shrinks the merged cells crossing the rows and cells `goes` says settling takes away, and moves one starting in a
 * row taken away into the next row it spans. Changes nothing where no merged cell crosses them.
 */
export function shrinkCrossingSpans(
  table: Y.XmlElement,
  goes: (node: Y.XmlElement) => boolean,
): void {
  const { changes, moves, rows, cells } = crossingSpans(table, goes);
  for (const [cell, change] of changes) {
    setSpan(cell, 'rowspan', change.rowspan);
    setSpan(cell, 'colspan', change.colspan);
    if (change.colwidth) cell.setAttribute('colwidth', change.colwidth as unknown as string);
  }
  // Left to right, so each lands after the cells, staying or moved, before it in its new row.
  const columnOfMoved = new Map<Y.XmlElement, number>();
  moves.sort((a, b) => a.column - b.column);
  for (const { cell: movedCell, column: movedColumn, to } of moves) {
    const target = rows[to]!;
    const before = target
      .toArray()
      .filter(isCell)
      .filter((cell) => {
        const at = cells.find((p) => p.cell === cell);
        const column = at ? at.column : (columnOfMoved.get(cell) ?? Infinity);
        return column < movedColumn;
      }).length;
    const copy = movedCell.clone();
    columnOfMoved.set(copy, movedColumn);
    target.insert(before, [copy]);
  }
}
