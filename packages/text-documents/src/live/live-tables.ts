// Tables in the live state (docs/specs/034-text-documents/tables.md "In the editor"): a `table` element of `table_row`s,
// each of `table_cell`s (a header row's are `table_header`s), each cell's blocks as the body's. A cell holds its spanned
// columns' widths (`colwidth`, points), so the table's columns are its first row's cells' widths in order.
import * as Y from 'yjs';
import type { Block } from '../model/blocks';
import {
  TABLE_COLUMN_FALLBACK_PT,
  Tables,
  type CellProps,
  type Table,
  type TableCell,
  type TableRow,
} from '../model/tables';
import { PARAGRAPH, TABLE, TABLE_CELL, TABLE_HEADER, TABLE_ROW } from './live-names';
import { blockSuggestionAttributes, readBlockSuggested } from './live-suggestion-files';

type Attributes = Record<string, unknown>;

/** A table as elements: `blockNode` writes each cell's blocks; `set` an element's attributes, undefined left out. */
export function tableElement(
  table: Table,
  blockNode: (block: Block) => Y.XmlElement,
  set: (element: Y.XmlElement, attributes: Attributes) => void,
): Y.XmlElement {
  const element = new Y.XmlElement(TABLE);
  set(element, {
    align: table.align,
    indent: table.indent,
    kept: table.kept,
    tag: table.tag,
    ...blockSuggestionAttributes(table.suggested),
  });
  const grid = Tables.grid(table);
  const rows = table.rows.map((row, r) => {
    const rowElement = new Y.XmlElement(TABLE_ROW);
    set(rowElement, {
      height: row.height,
      heightRule: row.heightRule,
      breaks: row.breaks,
      kept: row.kept,
      tag: row.tag,
    });
    const origins = grid[r]!.filter((place) => place?.origin && place.row === r);
    const cells = row.cells.map((cell) => {
      const column = origins.find((place) => place!.cell === cell)?.column ?? 0;
      const span = cell.colSpan ?? 1;
      const cellElement = new Y.XmlElement(r < table.headerRows ? TABLE_HEADER : TABLE_CELL);
      set(cellElement, {
        colspan: span > 1 ? span : undefined,
        rowspan: (cell.rowSpan ?? 1) > 1 ? cell.rowSpan : undefined,
        colwidth: table.columns.slice(column, column + span),
        props: Object.keys(cell.props).length > 0 ? cell.props : undefined,
        kept: cell.kept,
        tag: cell.tag,
      });
      cellElement.insert(0, cell.blocks.map(blockNode));
      return cellElement;
    });
    rowElement.insert(0, cells);
    return rowElement;
  });
  element.insert(0, rows);
  return element;
}

const isElement = (node: unknown, name: string): node is Y.XmlElement =>
  node instanceof Y.XmlElement && node.nodeName === name;
const isCell = (node: unknown): node is Y.XmlElement =>
  isElement(node, TABLE_CELL) || isElement(node, TABLE_HEADER);
const span = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 1 ? value : undefined;
const defined = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;

/**
 * A table element as the model's table, made whole as a file's table is read (merged edits may leave a row short), its
 * columns the first row's cells' widths; none when it holds no rows. `block` reads a cell's child; `normal` the style
 * an added empty cell holds.
 */
export function tableOf(
  element: Y.XmlElement,
  block: (node: Y.XmlElement) => Block | null,
  normal: string,
): Table | null {
  const a = element.getAttributes() as Attributes;
  const rowElements = element.toArray().filter((n) => isElement(n, TABLE_ROW));
  const columns: number[] = [];
  for (const cell of rowElements[0]?.toArray().filter(isCell) ?? []) {
    const widths = cell.getAttribute('colwidth') as unknown;
    const count = span(cell.getAttribute('colspan')) ?? 1;
    for (let i = 0; i < count; i += 1) {
      const width = Array.isArray(widths) ? (widths[i] as unknown) : undefined;
      columns.push(typeof width === 'number' && width > 0 ? width : TABLE_COLUMN_FALLBACK_PT);
    }
  }
  let headerRows = 0;
  const rows = rowElements.map((rowElement, r): TableRow => {
    const cellElements = rowElement.toArray().filter(isCell);
    if (
      headerRows === r &&
      cellElements.length > 0 &&
      cellElements.every((c) => c.nodeName === TABLE_HEADER)
    )
      headerRows += 1;
    const ra = rowElement.getAttributes() as Attributes;
    const cells = cellElements.map((cellElement): TableCell => {
      const ca = cellElement.getAttributes() as Attributes;
      const blocks = cellElement.toArray().flatMap((node) => {
        const read = node instanceof Y.XmlElement ? block(node) : null;
        return read ? [read] : [];
      });
      return defined({
        blocks,
        colSpan: span(ca.colspan),
        rowSpan: span(ca.rowspan),
        props: (ca.props as CellProps | undefined) ?? {},
        kept: ca.kept as TableCell['kept'],
        tag: ca.tag as TableCell['tag'],
      });
    });
    return defined({
      cells,
      height: ra.height as TableRow['height'],
      heightRule: ra.heightRule as TableRow['heightRule'],
      breaks: ra.breaks as TableRow['breaks'],
      kept: ra.kept as TableRow['kept'],
      tag: ra.tag as TableRow['tag'],
    });
  });
  const table: Table = defined({
    type: 'table' as const,
    columns,
    rows,
    headerRows,
    align: a.align as Table['align'],
    indent: a.indent as Table['indent'],
    kept: a.kept as Table['kept'],
    tag: a.tag as Table['tag'],
    suggested: readBlockSuggested(a),
  });
  return Tables.normalised(table, normal, () => {});
}

/** The paragraph elements of a fragment or cell in reading order, those in its tables' cells included. */
export function paragraphElementsOf(parent: Y.XmlFragment | Y.XmlElement): Y.XmlElement[] {
  return parent.toArray().flatMap((node): Y.XmlElement[] => {
    if (isElement(node, PARAGRAPH)) return [node];
    if (isElement(node, TABLE))
      return node
        .toArray()
        .filter((row): row is Y.XmlElement => isElement(row, TABLE_ROW))
        .flatMap((row) => row.toArray().filter(isCell).flatMap(paragraphElementsOf));
    return [];
  });
}
