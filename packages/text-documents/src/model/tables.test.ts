// docs/specs/034-text-documents/tables.md "The model" and "In the formats" (read leniently).
import { describe, expect, it } from 'vitest';
import { Paragraph, type Block } from './blocks';
import {
  Blocks,
  TABLE_COLUMN_FALLBACK_PT,
  Tables,
  TEXT_DOCUMENT_TABLE_MAX_COLUMNS,
  TEXT_DOCUMENT_TABLE_MAX_ROWS,
  type Table,
  type TableCell,
  type TableRepair,
} from './tables';

const cell = (text: string, extra: Partial<TableCell> = {}): TableCell => ({
  blocks: [Paragraph.of(text, 'Standard')],
  props: {},
  ...extra,
});

const table = (rows: TableCell[][], columns: number[], extra: Partial<Table> = {}): Table => ({
  type: 'table',
  columns,
  rows: rows.map((cells) => ({ cells })),
  headerRows: 0,
  ...extra,
});

const texts = (t: Table) =>
  t.rows.map((r) => r.cells.map((c) => Blocks.paragraphs(c.blocks).map(Paragraph.text).join('|')));

const normalise = (t: Table) => {
  const repairs: TableRepair[] = [];
  const out = Tables.normalised(t, 'Standard', (r) => repairs.push(r));
  return { out, repairs };
};

describe('Tables.of', () => {
  it('makes a grid of empty cells, the columns sharing the width equally', () => {
    const t = Tables.of({ rows: 2, columns: 4, width: 468, style: 'Standard' });
    expect(t.columns).toEqual([117, 117, 117, 117]);
    expect(texts(t)).toEqual([
      ['', '', '', ''],
      ['', '', '', ''],
    ]);
    expect(t.headerRows).toBe(0);
    expect(Tables.width(t)).toBe(468);
  });
});

describe('Tables.grid', () => {
  it('places each cell on its columns, spans covering the places below and beside', () => {
    const merged = cell('a', { colSpan: 2, rowSpan: 2 });
    const t = table([[merged, cell('b')], [cell('c')]], [10, 20, 30]);
    const grid = Tables.grid(t);
    expect(grid.map((row) => row.map((p) => p && [p.row, p.column, p.origin]))).toEqual([
      [
        [0, 0, true],
        [0, 0, false],
        [0, 2, true],
      ],
      [
        [0, 0, false],
        [0, 0, false],
        [1, 2, true],
      ],
    ]);
    expect(Tables.cellWidth(t, 0, merged)).toBe(30);
  });

  it('leaves places no cell covers empty, and places no cell past the grid', () => {
    expect(Tables.grid(table([[cell('a')]], [10, 10]))[0]![1]).toBeNull();
    expect(Tables.grid(table([[cell('a'), cell('b')]], [10]))[0]!.map((p) => p?.cell)).toHaveLength(
      1,
    );
  });
});

describe('Tables.normalised', () => {
  it('keeps a well-formed table as it is, telling no repair', () => {
    const t = table([[cell('a', { rowSpan: 2 }), cell('b')], [cell('c')]], [10, 20], {
      headerRows: 1,
    });
    const { out, repairs } = normalise(t);
    expect(out).toEqual(t);
    expect(repairs).toEqual([]);
  });

  it('fills a short row with empty cells, in their columns', () => {
    const { out, repairs } = normalise(
      table([[cell('a'), cell('b'), cell('c')], [cell('d')]], [10, 10, 10]),
    );
    expect(texts(out!)).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
    ]);
    expect(repairs).toEqual(['short row']);
  });

  it("widens the grid for a long row by columns of the table's average width", () => {
    const { out, repairs } = normalise(table([[cell('a'), cell('b'), cell('c')]], [10, 20]));
    expect(out!.columns).toEqual([10, 20, 15]);
    expect(repairs).toEqual(['long row']);
  });

  it('widens a table with no columns by the fallback width', () => {
    const { out } = normalise(table([[cell('a')]], []));
    expect(out!.columns).toEqual([TABLE_COLUMN_FALLBACK_PT]);
  });

  it("cuts a span past the table's edge, or onto a place another cell holds", () => {
    const { out, repairs } = normalise(
      table(
        [[cell('a', { rowSpan: 5 }), cell('b', { colSpan: 3 })], [cell('c', { colSpan: 2 })]],
        [10, 10],
      ),
    );
    expect(out!.rows[0]!.cells.map((c) => [c.colSpan, c.rowSpan])).toEqual([
      [undefined, 2],
      [undefined, undefined],
    ]);
    expect(out!.rows[1]!.cells.map((c) => c.colSpan)).toEqual([undefined]);
    expect(repairs).toEqual(['span past the edge']);
  });

  it('gives a cell holding no paragraph an empty one, after what it holds', () => {
    const inner = table([[cell('x')]], [10]);
    const { out, repairs } = normalise(table([[{ blocks: [inner], props: {} }]], [10]));
    const blocks = out!.rows[0]!.cells[0]!.blocks;
    expect(blocks.map((b) => b.type)).toEqual(['table', 'paragraph']);
    expect(repairs).toEqual([]);
  });

  it('holds header rows within the rows, and drops a table with no rows', () => {
    expect(normalise(table([[cell('a')]], [10], { headerRows: 4 })).out!.headerRows).toBe(1);
    expect(normalise(table([], [10])).out).toBeNull();
  });

  it('reads spans that are not whole numbers above one as one', () => {
    const { out } = normalise(table([[cell('a', { colSpan: 0 }), cell('b')]], [10, 10]));
    expect(texts(out!)).toEqual([['a', 'b']]);
  });
});

describe('Tables.fits', () => {
  it('holds at most 1,000 rows and 63 columns', () => {
    const wide = Tables.of({
      rows: 1,
      columns: TEXT_DOCUMENT_TABLE_MAX_COLUMNS,
      width: 63,
      style: 'S',
    });
    expect(Tables.fits(wide)).toBe(true);
    expect(Tables.fits({ ...wide, columns: [...wide.columns, 1] })).toBe(false);
    const long = {
      ...wide,
      rows: Array.from({ length: TEXT_DOCUMENT_TABLE_MAX_ROWS + 1 }, () => wide.rows[0]!),
    };
    expect(Tables.fits(long)).toBe(false);
  });
});

describe('Blocks', () => {
  const nested: Block[] = [
    Paragraph.of('before', 'S'),
    table(
      [[cell('a'), { blocks: [table([[cell('deep')]], [5]), Paragraph.of('b', 'S')], props: {} }]],
      [10, 10],
    ),
    Paragraph.of('after', 'S'),
  ];

  it('lists every paragraph in reading order, those in cells at any depth', () => {
    expect(Blocks.paragraphs(nested).map(Paragraph.text)).toEqual([
      'before',
      'a',
      'deep',
      'b',
      'after',
    ]);
  });

  it("maps every cell's blocks, the deepest first", () => {
    const upper = Blocks.mapCells(nested, (blocks) =>
      blocks.map((b) =>
        b.type === 'paragraph' ? Paragraph.of(Paragraph.text(b).toUpperCase(), 'S') : b,
      ),
    );
    expect(Blocks.paragraphs(upper).map(Paragraph.text)).toEqual([
      'before',
      'A',
      'DEEP',
      'B',
      'after',
    ]);
  });
});
