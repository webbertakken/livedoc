// A changeset's `table` operations (docs/specs/034-text-documents/agents-and-sync.md "How the writing lands"), on the
// live state's elements so the writing in the cells left keeps its identity: rows and columns added and deleted, merged
// cells growing and shrinking with them, and a cell's text set.
import * as Y from 'yjs';
import { liveBlockNodes } from '../live/live-write';
import { PARAGRAPH, TABLE, TABLE_CELL, TABLE_HEADER, TABLE_ROW } from '../live/live-names';
import { markdownRuns } from './markdown-in';
import type { TableAction } from './text-ops';

type Place = { cell: Y.XmlElement; row: number; column: number };

const isNamed = (node: unknown, ...names: string[]): node is Y.XmlElement =>
  node instanceof Y.XmlElement && names.includes(node.nodeName);

const spanOf = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 1 ? value : 1;

const widthsOf = (cell: Y.XmlElement): number[] => {
  const value = cell.getAttribute('colwidth') as unknown;
  return Array.isArray(value) ? value.filter((w): w is number => typeof w === 'number') : [];
};

// Yjs types an attribute's value as a string; its encoding takes any JSON value, as live-write's attributes are.
const setAttribute = (element: Y.XmlElement, name: string, value: unknown): void => {
  if (value === undefined || (name.endsWith('span') && value === 1)) element.removeAttribute(name);
  else element.setAttribute(name, value as string);
};

/** A table's elements as a grid: its rows, its width in columns, each place's cell, and each column's width. */
class LiveGrid {
  readonly rows: Y.XmlElement[];
  readonly width: number;
  readonly places: (Place | null)[][];
  readonly columns: number[];

  readonly table: Y.XmlElement;

  constructor(table: Y.XmlElement) {
    this.table = table;
    this.rows = table.toArray().filter((n): n is Y.XmlElement => isNamed(n, TABLE_ROW));
    const cellsOf = (row: Y.XmlElement) =>
      row.toArray().filter((n): n is Y.XmlElement => isNamed(n, TABLE_CELL, TABLE_HEADER));
    this.width = Math.max(
      0,
      ...this.rows.map((row) =>
        cellsOf(row).reduce((n, c) => n + spanOf(c.getAttribute('colspan')), 0),
      ),
    );
    this.places = this.rows.map(() => Array.from<Place | null>({ length: this.width }).fill(null));
    this.columns = Array.from<number>({ length: this.width }).fill(0);
    this.rows.forEach((row, r) => {
      let column = 0;
      for (const cell of cellsOf(row)) {
        while (column < this.width && this.places[r]![column]) column += 1;
        if (column >= this.width) break;
        const rows = Math.min(spanOf(cell.getAttribute('rowspan')), this.rows.length - r);
        const columns = Math.min(spanOf(cell.getAttribute('colspan')), this.width - column);
        const widths = widthsOf(cell);
        for (let dc = 0; dc < columns; dc += 1) {
          if (this.columns[column + dc] === 0) this.columns[column + dc] = widths[dc] ?? 0;
          for (let dr = 0; dr < rows; dr += 1)
            this.places[r + dr]![column + dc] = { cell, row: r, column };
        }
        column += columns;
      }
    });
  }

  cells(): Y.XmlElement[] {
    return [...new Set(this.places.flat().flatMap((p) => (p ? [p.cell] : [])))];
  }

  /** Where in row `r` a cell starting at `column` goes: after the row's own cells to its left. */
  indexIn(r: number, column: number): number {
    const own = new Set<Y.XmlElement>();
    for (let c = 0; c < column; c += 1) {
      const place = this.places[r]![c];
      if (place && place.row === r) own.add(place.cell);
    }
    return own.size;
  }

  isHeader(r: number): boolean {
    const row = this.rows[r];
    return !!row && row.toArray().some((n) => isNamed(n, TABLE_HEADER));
  }
}

/** The style of a cell's first paragraph, else `normal`. */
const firstStyle = (cell: Y.XmlElement | undefined, normal: string): string => {
  const paragraph = cell?.toArray().find((n) => isNamed(n, PARAGRAPH));
  const style = paragraph?.getAttribute('style') as unknown;
  return typeof style === 'string' ? style : normal;
};

function emptyCell(
  doc: Y.Doc,
  header: boolean,
  widths: number[],
  style: string,
  like?: Y.XmlElement,
): Y.XmlElement {
  const cell = new Y.XmlElement(header ? TABLE_HEADER : TABLE_CELL);
  setAttribute(cell, 'colwidth', widths);
  const props = like?.getAttribute('props') as unknown;
  if (props !== undefined) setAttribute(cell, 'props', props);
  cell.insert(0, liveBlockNodes(doc, [{ type: 'paragraph', style, props: {}, inlines: [] }]));
  return cell;
}

/** The table holding a paragraph, nearest first; null outside a table. */
export function tableOfParagraph(paragraph: Y.XmlElement): Y.XmlElement | null {
  for (let node = paragraph.parent; node; node = node.parent) if (isNamed(node, TABLE)) return node;
  return null;
}

/** Deletes the table, leaving its parent an empty paragraph when it held nothing else. */
function deleteTable(doc: Y.Doc, table: Y.XmlElement, normal: string): void {
  const parent = table.parent as Y.XmlElement | Y.XmlFragment;
  const index = parent.toArray().indexOf(table);
  parent.delete(index, 1);
  if (parent.length === 0)
    parent.insert(
      0,
      liveBlockNodes(doc, [{ type: 'paragraph', style: normal, props: {}, inlines: [] }]),
    );
}

function addRow(doc: Y.Doc, grid: LiveGrid, n: number, normal: string): void {
  const row = new Y.XmlElement(TABLE_ROW);
  const header = n < grid.rows.length && n > 0 && grid.isHeader(n) && grid.isHeader(n - 1);
  const grown = new Set<Y.XmlElement>();
  const cells: Y.XmlElement[] = [];
  for (let c = 0; c < grid.width; c += 1) {
    const above = n > 0 ? grid.places[n - 1]![c] : null;
    const below = n < grid.rows.length ? grid.places[n]![c] : null;
    if (above && below && above.cell === below.cell) {
      if (!grown.has(above.cell))
        setAttribute(above.cell, 'rowspan', spanOf(above.cell.getAttribute('rowspan')) + 1);
      grown.add(above.cell);
      continue;
    }
    cells.push(
      emptyCell(doc, header, [grid.columns[c]!], firstStyle(above?.cell, normal), above?.cell),
    );
  }
  row.insert(0, cells);
  const at =
    n === 0
      ? grid.table.toArray().indexOf(grid.rows[0]!)
      : grid.table.toArray().indexOf(grid.rows[n - 1]!) + 1;
  grid.table.insert(at, [row]);
}

function deleteRow(doc: Y.Doc, grid: LiveGrid, n: number, normal: string): void {
  const r = n - 1;
  const seen = new Set<Y.XmlElement>();
  for (let c = 0; c < grid.width; c += 1) {
    const place = grid.places[r]![c];
    if (!place || seen.has(place.cell)) continue;
    seen.add(place.cell);
    const rows = spanOf(place.cell.getAttribute('rowspan'));
    if (place.row < r) setAttribute(place.cell, 'rowspan', rows - 1);
    else if (rows > 1) {
      // A merged cell starting in the row goes on in the row below, one row shorter, its writing gone with the row.
      const next = grid.rows[r + 1]!;
      const moved = emptyCell(
        doc,
        grid.isHeader(r + 1),
        widthsOf(place.cell),
        firstStyle(place.cell, normal),
        place.cell,
      );
      setAttribute(moved, 'rowspan', rows - 1);
      setAttribute(moved, 'colspan', place.cell.getAttribute('colspan'));
      next.insert(grid.indexIn(r + 1, c), [moved]);
    }
  }
  grid.table.delete(grid.table.toArray().indexOf(grid.rows[r]!), 1);
}

function addColumn(doc: Y.Doc, grid: LiveGrid, n: number, normal: string): void {
  const total = grid.columns.reduce((a, b) => a + b, 0);
  const average = total / (grid.width + 1);
  const scale = grid.width / (grid.width + 1);
  const round = (w: number) => Math.round(w * scale * 100) / 100;
  for (const cell of grid.cells()) setAttribute(cell, 'colwidth', widthsOf(cell).map(round));
  const added = Math.round(average * 100) / 100;
  const grown = new Set<Y.XmlElement>();
  grid.rows.forEach((row, r) => {
    const left = n > 0 ? grid.places[r]![n - 1] : null;
    const right = n < grid.width ? grid.places[r]![n] : null;
    if (left && right && left.cell === right.cell) {
      if (!grown.has(left.cell)) {
        const widths = widthsOf(left.cell);
        widths.splice(n - left.column, 0, added);
        setAttribute(left.cell, 'colwidth', widths);
        setAttribute(left.cell, 'colspan', spanOf(left.cell.getAttribute('colspan')) + 1);
      }
      grown.add(left.cell);
      return;
    }
    const like = left?.cell ?? right?.cell;
    row.insert(grid.indexIn(r, n), [
      emptyCell(doc, grid.isHeader(r), [added], firstStyle(like, normal), like),
    ]);
  });
}

function deleteColumn(grid: LiveGrid, n: number): void {
  const c = n - 1;
  const seen = new Set<Y.XmlElement>();
  for (let r = 0; r < grid.rows.length; r += 1) {
    const place = grid.places[r]![c];
    if (!place || seen.has(place.cell)) continue;
    seen.add(place.cell);
    const columns = spanOf(place.cell.getAttribute('colspan'));
    if (columns > 1) {
      const widths = widthsOf(place.cell);
      widths.splice(c - place.column, 1);
      setAttribute(place.cell, 'colwidth', widths);
      setAttribute(place.cell, 'colspan', columns - 1);
    } else {
      const row = grid.rows[place.row]!;
      row.delete(row.toArray().indexOf(place.cell), 1);
    }
  }
}

function setCell(doc: Y.Doc, place: Place, text: string, normal: string): void {
  const style = firstStyle(place.cell, normal);
  place.cell.delete(0, place.cell.length);
  place.cell.insert(
    0,
    liveBlockNodes(doc, [{ type: 'paragraph', style, props: {}, inlines: markdownRuns(text) }]),
  );
}

/** The action on the table, or why it does not fit the table (a row or column past it). */
export function applyTableAction(
  doc: Y.Doc,
  table: Y.XmlElement,
  action: TableAction,
  normal: string,
): { ok: true } | { ok: false; message: string } {
  const grid = new LiveGrid(table);
  const rows = grid.rows.length;
  const columns = grid.width;
  const size = `the table has ${rows} row${rows === 1 ? '' : 's'} and ${columns} column${columns === 1 ? '' : 's'}`;
  const past = (what: string) => ({ ok: false as const, message: `${what}: ${size}` });
  switch (action.action) {
    case 'add-row':
      if (action.n > rows) return past(`after row ${action.n}`);
      addRow(doc, grid, action.n, normal);
      break;
    case 'delete-row':
      if (action.n > rows) return past(`row ${action.n}`);
      if (rows === 1) deleteTable(doc, table, normal);
      else deleteRow(doc, grid, action.n, normal);
      break;
    case 'add-column':
      if (action.n > columns) return past(`after column ${action.n}`);
      addColumn(doc, grid, action.n, normal);
      break;
    case 'delete-column':
      if (action.n > columns) return past(`column ${action.n}`);
      if (columns === 1) deleteTable(doc, table, normal);
      else deleteColumn(grid, action.n);
      break;
    case 'set': {
      const place = grid.places[action.row - 1]?.[action.column - 1];
      if (!place) return past(`cell ${action.row},${action.column}`);
      setCell(doc, place, action.text, normal);
      break;
    }
  }
  return { ok: true };
}
