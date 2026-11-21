// docs/specs/029-sheets/files-and-print.md "A file sent in parts" (D86): what rides the create, and the writes after.
import { describe, expect, it } from 'vitest';
import type { CellInput } from '../sheet';
import { FILE_AXIS_IDS_PER_WRITE, FILE_CREATE_BYTES_MAX, fileParts } from './file-parts';
import type { SheetFromFile } from './workbook-file';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function sheet(
  id: string,
  rows: number,
  cols: number,
  cells: [number, number, CellInput][],
): SheetFromFile {
  const layout = { rows: ids(`${id}r`, rows), cols: ids(`${id}c`, cols) };
  return {
    id,
    title: id,
    layout,
    cells: cells.map(([r, c, i]) => ({ r: layout.rows[r]!, c: layout.cols[c]!, i })),
  };
}

describe('fileParts', () => {
  it('sends a sheet within a new grid whole with the create', () => {
    const small = sheet('s', 1000, 26, [[0, 0, { n: 1 }]]);
    const plan = fileParts([small]);
    expect(plan.seeds).toEqual([small]);
    expect(plan.parts).toEqual([]);
    expect(plan.seededUnits).toBe(plan.totalUnits);
    expect(plan.totalUnits).toBe(1027);
  });

  it('sends the other rows, then columns, then cells in writes after the first 1,000 rows and 26 columns', () => {
    const rows = 1000 + FILE_AXIS_IDS_PER_WRITE + 1;
    const big = sheet('b', rows, 30, [
      [0, 0, { n: 1 }],
      [0, 27, { s: 'wide' }],
      [rows - 1, 0, { s: 'deep' }],
    ]);
    const plan = fileParts([big]);
    expect(plan.seeds[0]!.layout).toEqual({
      rows: big.layout.rows.slice(0, 1000),
      cols: big.layout.cols.slice(0, 26),
    });
    expect(plan.seeds[0]!.cells).toEqual([big.cells[0]]);
    expect(plan.parts.map((p) => [p.write.kind, p.units])).toEqual([
      ['layout', FILE_AXIS_IDS_PER_WRITE],
      ['layout', 1],
      ['layout', 4],
      ['cells', 2],
    ]);
    const [first, second, cols, cells] = plan.parts;
    expect(first!.write).toMatchObject({
      changes: [
        {
          k: 'insertRows',
          after: 'br999',
          ids: big.layout.rows.slice(1000, 1000 + FILE_AXIS_IDS_PER_WRITE),
        },
      ],
    });
    expect(second!.write).toMatchObject({
      changes: [{ k: 'insertRows', after: `br${999 + FILE_AXIS_IDS_PER_WRITE}` }],
    });
    expect(cols!.write).toMatchObject({
      changes: [{ k: 'insertCols', after: 'bc25', ids: ['bc26', 'bc27', 'bc28', 'bc29'] }],
    });
    expect(cells).toEqual({
      sheetId: 'b',
      write: { kind: 'cells', cells: [big.cells[1], big.cells[2]] },
      units: 2,
    });
    expect(plan.seededUnits + plan.parts.reduce((n, p) => n + p.units, 0)).toBe(plan.totalUnits);
  });

  it('keeps the create within its bytes, the rest of the cells in writes', () => {
    const text = 'x'.repeat(10_000);
    const many = Array.from({ length: 500 }, (_, i): [number, number, CellInput] => [
      i,
      0,
      { s: text },
    ]);
    const plan = fileParts([sheet('t', 1000, 26, many)]);
    const seeded = plan.seeds[0]!.cells.length;
    expect(seeded).toBeGreaterThan(300);
    expect(seeded).toBeLessThan(500);
    expect(JSON.stringify(plan.seeds).length).toBeLessThanOrEqual(FILE_CREATE_BYTES_MAX);
    expect(plan.parts.reduce((n, p) => n + p.units, 0)).toBe(500 - seeded);
  });
});
