// A file's sheets sent in parts (docs/specs/029-sheets/files-and-print.md "A file sent in parts", D86): the
// spreadsheet is made with each sheet at a new sheet's grid and the cells that fit one request, then every other row,
// column and cell follows in writes, each within a write's limits, in the order they must land: a sheet's rows, its
// columns, then its cells. Pure: the editor sends what this plans, and counts its progress in `units`.
import { splitWrite } from '../commands';
import type { SheetObject } from '../objects/sheet-objects';
import type { CellChange, SheetWrite } from '../store';
import { WORKBOOK_COLS_NEW, WORKBOOK_ROWS_NEW } from '../workbook-record';
import type { SheetFromFile } from './workbook-file';

/** The bytes of sheets the create carries (D86): half the api's 8 MB body cap, the rest for the document. */
export const FILE_CREATE_BYTES_MAX = 4 * 1024 * 1024;

/**
 * Row or column ids one write inserts: an id is at most 10 bytes as JSON, so a write stays near half a megabyte,
 * well inside a write's 1 MB. Safe range 1,000 to 90,000.
 */
export const FILE_AXIS_IDS_PER_WRITE = 50_000;

/** One write of the file, to one sheet, and how many rows, columns or cells it carries. */
export type FilePart = { sheetId: string; write: SheetWrite; units: number };

/** The sheets the create makes, the writes after it in order, and the units each side carries. */
export type FileParts = {
  seeds: SheetFromFile[];
  parts: FilePart[];
  seededUnits: number;
  totalUnits: number;
};

type CellsWrite = Extract<SheetWrite, { kind: 'cells' }>;

const sizeOf = (value: unknown): number => JSON.stringify(value).length + 1;

function axisParts(
  sheetId: string,
  k: 'insertRows' | 'insertCols',
  ids: readonly string[],
  after: string,
): FilePart[] {
  const parts: FilePart[] = [];
  let last = after;
  for (let at = 0; at < ids.length; at += FILE_AXIS_IDS_PER_WRITE) {
    const chunk = ids.slice(at, at + FILE_AXIS_IDS_PER_WRITE);
    parts.push({
      sheetId,
      write: { kind: 'layout', changes: [{ k, after: last, ids: chunk }] },
      units: chunk.length,
    });
    last = chunk[chunk.length - 1]!;
  }
  return parts;
}

/** The plan for sending a file's sheets: what rides the create, and the writes that follow. */
export function fileParts(sheets: readonly SheetFromFile[]): FileParts {
  const seeds: SheetFromFile[] = [];
  const later: {
    id: string;
    after: [string, string];
    rows: string[];
    cols: string[];
    cells: CellChange[];
    objects: SheetObject[];
  }[] = [];
  let bytes = 0;
  let seededUnits = 0;
  let totalUnits = 0;
  for (const sheet of sheets) {
    const { rows, cols } = sheet.layout;
    const seedRows = rows.slice(0, WORKBOOK_ROWS_NEW);
    const seedCols = cols.slice(0, WORKBOOK_COLS_NEW);
    // Its charts land last, once every row and column they read is there.
    const { objects, ...rest } = sheet.layout;
    const layout = { ...rest, rows: seedRows, cols: seedCols };
    bytes += sizeOf(layout) + sizeOf(sheet.title) + sizeOf(sheet.id);
    const rowAt = new Map(rows.map((id, i) => [id, i]));
    const colAt = new Map(cols.map((id, i) => [id, i]));
    const seeded: SheetFromFile['cells'] = [];
    const cellsLater: CellChange[] = [];
    for (const cell of sheet.cells) {
      const inGrid = rowAt.get(cell.r)! < seedRows.length && colAt.get(cell.c)! < seedCols.length;
      const size = sizeOf(cell);
      if (inGrid && bytes + size <= FILE_CREATE_BYTES_MAX) {
        seeded.push(cell);
        bytes += size;
      } else cellsLater.push(cell);
    }
    seeds.push({ id: sheet.id, title: sheet.title, layout, cells: seeded });
    seededUnits += seedRows.length + seedCols.length + seeded.length;
    totalUnits += rows.length + cols.length + sheet.cells.length + (objects?.length ?? 0);
    later.push({
      id: sheet.id,
      after: [seedRows.at(-1)!, seedCols.at(-1)!],
      rows: rows.slice(seedRows.length),
      cols: cols.slice(seedCols.length),
      cells: cellsLater,
      objects: objects ?? [],
    });
  }
  const parts: FilePart[] = [];
  for (const { id, after, rows, cols, cells, objects } of later) {
    parts.push(...axisParts(id, 'insertRows', rows, after[0]));
    parts.push(...axisParts(id, 'insertCols', cols, after[1]));
    const writes = cells.length === 0 ? [] : splitWrite({ kind: 'cells', cells });
    for (const write of writes.filter((w): w is CellsWrite => w.kind === 'cells'))
      parts.push({ sheetId: id, write, units: write.cells.length });
    if (objects.length)
      parts.push({
        sheetId: id,
        write: {
          kind: 'layout',
          changes: objects.map((object) => ({ k: 'object', id: object.id, object })),
        },
        units: objects.length,
      });
  }
  return { seeds, parts, seededUnits, totalUnits };
}
