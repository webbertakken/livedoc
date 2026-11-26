// Tables (docs/specs/034-text-documents/tables.md "The model"): column widths, rows of cells with their spans, header
// rows, alignment and indent; each cell holds blocks as the body does. A row lists only the cells that start in it.
import type { KeptXml } from '@livedoc/office-packages';
import type { Block, Paragraph } from './blocks';
import { Paragraph as Paragraphs } from './blocks';
import type { BorderLine, KeptProperties } from './props';
import type { BlockSuggested } from './suggestions';

/** (default) The most rows a table holds (tables.md "Limits"); past it, it stays a kept block. */
export const TEXT_DOCUMENT_TABLE_MAX_ROWS = 1000;
/** The most columns a table holds: Word's own limit (tables.md "Limits"); past it, it stays a kept block. */
export const TEXT_DOCUMENT_TABLE_MAX_COLUMNS = 63;
/** (default) A column a file gives no width: an inch, the width a table read leniently widens by when it has none. */
export const TABLE_COLUMN_FALLBACK_PT = 72;

export type CellSide = 'top' | 'bottom' | 'left' | 'right';
export const CELL_SIDES: readonly CellSide[] = ['top', 'bottom', 'left', 'right'];

/** A cell's line per side; a side left out has none. A line's `space` is 0: a cell's padding is its own. */
export type CellBorders = { readonly [side in CellSide]?: BorderLine };
/** A cell's padding per side, in points. */
export type CellPadding = { readonly [side in CellSide]?: number };

export type CellVerticalAlign = 'top' | 'middle' | 'bottom';

/** A cell's formatting: its background colour (`#rrggbb`), lines, padding and vertical alignment. */
export type CellProps = {
  readonly background?: string;
  readonly borders?: CellBorders;
  readonly padding?: CellPadding;
  readonly verticalAlign?: CellVerticalAlign;
};

export type TableCell = {
  /** At least one paragraph; tables nest. */
  readonly blocks: readonly Block[];
  /** Columns it spans, 1 when absent. */
  readonly colSpan?: number;
  /** Rows it spans, 1 when absent. */
  readonly rowSpan?: number;
  readonly props: CellProps;
  /** ODF: the cell style; OOXML: `w:tcPr`. */
  readonly kept?: KeptProperties;
  /** ODF: the element's start tag, its attributes the model does not map written back. */
  readonly tag?: KeptXml;
};

export type TableRow = {
  readonly cells: readonly TableCell[];
  /** Its height in points: a minimum, or exact under `heightRule` `exact`. */
  readonly height?: number;
  /** Absent: the height is a minimum. */
  readonly heightRule?: 'exact';
  /** Whether it may break across pages; true when absent. */
  readonly breaks?: false;
  readonly kept?: KeptProperties;
  readonly tag?: KeptXml;
};

/** Where a table narrower than the text stands; absent, at the start. */
export type TableAlign = 'center' | 'end';

export type Table = {
  readonly type: 'table';
  /** Each grid column's width in points. */
  readonly columns: readonly number[];
  readonly rows: readonly TableRow[];
  /** How many leading rows are header rows. */
  readonly headerRows: number;
  readonly align?: TableAlign;
  /** Its left indent in points. */
  readonly indent?: number;
  /** ODF: the table style; OOXML: `w:tblPr`. */
  readonly kept?: KeptProperties;
  readonly tag?: KeptXml;
  /** Its insertion or deletion, whole (review.md "How a suggestion is kept"). */
  readonly suggested?: BlockSuggested;
};

/** A place of the grid: the cell covering it, the row and column the cell starts at, and whether it starts here. */
export type GridPlace = {
  readonly cell: TableCell;
  readonly row: number;
  readonly column: number;
  readonly origin: boolean;
};

/** What a lenient read repaired, by name (tables.md "In the formats", read leniently). */
export type TableRepair = 'short row' | 'long row' | 'span past the edge';

const spanOf = (n: number | undefined) => (n !== undefined && Number.isInteger(n) && n > 1 ? n : 1);

export const Tables = {
  /** A table of empty cells, its columns sharing `width` equally (tables.md "Inserting"). */
  of: ({
    rows,
    columns,
    width,
    style,
  }: {
    rows: number;
    columns: number;
    width: number;
    style: string;
  }): Table => ({
    type: 'table',
    columns: Array.from({ length: columns }, () => width / columns),
    rows: Array.from({ length: rows }, () => ({
      cells: Array.from({ length: columns }, () => Tables.emptyCell(style)),
    })),
    headerRows: 0,
  }),

  emptyCell: (style: string): TableCell => ({ blocks: [Paragraphs.of('', style)], props: {} }),

  /** Each row's places, column by column; a place no cell covers is null (none after `normalised`). */
  grid: (table: Table): (GridPlace | null)[][] => {
    const width = table.columns.length;
    const places: (GridPlace | null)[][] = table.rows.map(() =>
      Array.from<GridPlace | null>({ length: width }).fill(null),
    );
    table.rows.forEach((row, r) => {
      let column = 0;
      for (const cell of row.cells) {
        while (column < width && places[r]![column]) column += 1;
        if (column >= width) break;
        const rows = Math.min(spanOf(cell.rowSpan), table.rows.length - r);
        const columns = Math.min(spanOf(cell.colSpan), width - column);
        for (let dr = 0; dr < rows; dr += 1)
          for (let dc = 0; dc < columns; dc += 1)
            places[r + dr]![column + dc] = {
              cell,
              row: r,
              column,
              origin: dr === 0 && dc === 0,
            };
        column += columns;
      }
    });
    return places;
  },

  /**
   * The table as the model holds it: short rows filled with empty cells, long rows widening the grid by columns of the
   * average width, spans cut at the edges and at places another cell holds, header rows within the rows, and every
   * cell holding a paragraph. Each repair is told once a table; null for a table with no rows.
   */
  normalised: (
    table: Table,
    style: string,
    repaired: (repair: TableRepair) => void,
  ): Table | null => {
    if (table.rows.length === 0) return null;
    const told = new Set<TableRepair>();
    const tell = (repair: TableRepair) => {
      if (told.has(repair)) return;
      told.add(repair);
      repaired(repair);
    };
    const columns = [...table.columns];
    const average = () =>
      columns.length > 0 ? columns.reduce((a, b) => a + b, 0) / columns.length : 0;
    const widen = (count: number) => {
      const width = average() || TABLE_COLUMN_FALLBACK_PT;
      for (let i = 0; i < count; i += 1) columns.push(width);
    };
    const taken: boolean[][] = table.rows.map(() => []);
    const placed: { column: number; cell: TableCell }[][] = table.rows.map(() => []);
    table.rows.forEach((row, r) => {
      let column = 0;
      for (const cell of row.cells) {
        while (taken[r]![column]) column += 1;
        let colSpan = spanOf(cell.colSpan);
        if (column >= columns.length) {
          tell('long row');
          widen(column + colSpan - columns.length);
        }
        let free = 0;
        while (free < colSpan && column + free < columns.length && !taken[r]![column + free])
          free += 1;
        if (free < colSpan) {
          tell('span past the edge');
          colSpan = free;
        }
        let rowSpan = spanOf(cell.rowSpan);
        if (r + rowSpan > table.rows.length) {
          tell('span past the edge');
          rowSpan = table.rows.length - r;
        }
        for (let dr = 0; dr < rowSpan; dr += 1)
          for (let dc = 0; dc < colSpan; dc += 1) taken[r + dr]![column + dc] = true;
        const { colSpan: _c, rowSpan: _r, ...rest } = cell;
        const blocks = cell.blocks.some((b) => b.type === 'paragraph')
          ? cell.blocks
          : [...cell.blocks, Paragraphs.of('', style)];
        placed[r]!.push({
          column,
          cell: {
            ...rest,
            blocks,
            ...(colSpan > 1 ? { colSpan } : {}),
            ...(rowSpan > 1 ? { rowSpan } : {}),
          },
        });
        column += colSpan;
      }
    });
    const rows = table.rows.map((row, r) => {
      const cells = placed[r]!;
      for (let column = 0; column < columns.length; column += 1)
        if (!taken[r]![column]) {
          tell('short row');
          cells.push({ column, cell: Tables.emptyCell(style) });
        }
      return {
        ...row,
        cells: cells.sort((a, b) => a.column - b.column).map((c) => c.cell),
      };
    });
    const headerRows = Math.max(0, Math.min(rows.length, Math.floor(table.headerRows) || 0));
    return { ...table, columns, rows, headerRows };
  },

  /** Whether the table is within the limits a table is held in (tables.md "Limits"). */
  fits: (table: Table): boolean =>
    table.rows.length <= TEXT_DOCUMENT_TABLE_MAX_ROWS &&
    table.columns.length <= TEXT_DOCUMENT_TABLE_MAX_COLUMNS,

  /** The width of a cell starting at `column`: its columns' sum. */
  cellWidth: (table: Table, column: number, cell: TableCell): number =>
    table.columns.slice(column, column + spanOf(cell.colSpan)).reduce((a, b) => a + b, 0),

  width: (table: Table): number => table.columns.reduce((a, b) => a + b, 0),
} as const;

export const Blocks = {
  /** Every paragraph of the blocks in reading order, those in table cells included, row by row. */
  paragraphs: (blocks: readonly Block[]): Paragraph[] =>
    blocks.flatMap((b): Paragraph[] =>
      b.type === 'paragraph'
        ? [b]
        : b.type === 'table'
          ? b.rows.flatMap((row) => row.cells.flatMap((cell) => Blocks.paragraphs(cell.blocks)))
          : [],
    ),
  /** Every table of the blocks, those in cells and notes at any depth, each before those it holds. */
  tables: (blocks: readonly Block[]): Table[] =>
    blocks.flatMap((b): Table[] =>
      b.type === 'table'
        ? [b, ...b.rows.flatMap((row) => row.cells.flatMap((cell) => Blocks.tables(cell.blocks)))]
        : b.type === 'paragraph'
          ? b.inlines.flatMap((i) => (i.type === 'note' ? Blocks.tables(i.blocks) : []))
          : [],
    ),
  /** The blocks with every table's cells' blocks mapped by `map`, at any depth. */
  mapCells: (
    blocks: readonly Block[],
    map: (blocks: readonly Block[]) => readonly Block[],
  ): Block[] =>
    blocks.map((b) =>
      b.type === 'table'
        ? {
            ...b,
            rows: b.rows.map((row) => ({
              ...row,
              cells: row.cells.map((cell) => ({
                ...cell,
                blocks: map(Blocks.mapCells(cell.blocks, map)),
              })),
            })),
          }
        : b,
    ),
} as const;
