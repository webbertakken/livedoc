import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetWrite } from '@livedoc/sheets';
import { workbookKit, type WorkbookKit } from '../routes/workbook-test-kit';
import { ROWS_SEARCHED_MAX, readCellWriteHead } from './sheet-cell-head';
import * as axes from './sheet-axes';

// docs/specs/029-sheets/performance.md "Held in memory": a cell write reads of a sheet's order only the rows it names,
// its rules' first and last rows and its first row, in their true order; never the whole order.

let kit: WorkbookKit;
let rows: string[];
let cols: string[];

// The book's sheet, its 10 rows stored over three chunks (keys apart, as the room keys them) with one left empty.
beforeEach(async () => {
  kit = workbookKit();
  await kit.call({ path: '', body: kit.document('book', true) });
  rows = [...kit.layout.rows];
  cols = [...kit.layout.cols];
  const { sql } = kit.sql;
  sql.exec("DELETE FROM sheet_axes WHERE sheet_id = 'bookSheet' AND axis = 'r'");
  const chunk = (key: number, ids: string[]) =>
    sql
      .prepare(
        "INSERT INTO sheet_axes (document_id, sheet_id, axis, chunk, ids) VALUES ('book', 'bookSheet', 'r', ?, ?)",
      )
      .run(key, JSON.stringify(ids));
  chunk(0, []);
  chunk(10, rows.slice(0, 4));
  chunk(20, rows.slice(4));
});

afterEach(() => vi.restoreAllMocks());

const cellsAt = (...at: string[]): Extract<SheetWrite, { kind: 'cells' }> => ({
  kind: 'cells',
  cells: at.map((r) => ({ r, c: cols[0]!, i: { n: 1 } })),
});

describe('readCellWriteHead', () => {
  it('reads the rows a write names, and the first, in their order across chunks', async () => {
    const head = await readCellWriteHead(
      kit.sql.env,
      'book',
      'bookSheet',
      cellsAt(rows[7]!, rows[2]!),
    );
    expect(head!.layout.rows).toEqual([rows[0], rows[2], rows[7]]);
    expect(head!.layout.cols).toEqual(cols);
  });

  it('finds as many rows by one scan of the chunks, in the same order', async () => {
    const named = [rows[9]!, rows[1]!, rows[5]!, rows[4]!, rows[3]!];
    expect(named.length).toBeGreaterThan(ROWS_SEARCHED_MAX);
    const head = await readCellWriteHead(kit.sql.env, 'book', 'bookSheet', cellsAt(...named));
    expect(head!.layout.rows).toEqual([rows[0], rows[1], rows[3], rows[4], rows[5], rows[9]]);
  });

  it('leaves out a row the sheet no longer holds', async () => {
    const head = await readCellWriteHead(
      kit.sql.env,
      'book',
      'bookSheet',
      cellsAt('gone01', rows[3]!),
    );
    expect(head!.layout.rows).toEqual([rows[0], rows[3]]);
  });

  it("reads its rules' first and last rows", async () => {
    const rule = {
      id: 'rule01',
      r1: rows[2]!,
      c1: cols[0]!,
      r2: rows[6]!,
      c2: cols[0]!,
      is: 'list' as const,
      opts: [{ v: 'Done' }],
    };
    await kit.write('book', { kind: 'layout', changes: [{ k: 'vrule', id: 'rule01', rule }] });
    const head = await readCellWriteHead(kit.sql.env, 'book', 'bookSheet', cellsAt(rows[4]!));
    expect(head!.layout.rows).toEqual([rows[0], rows[2], rows[4], rows[6]]);
  });

  it('never reads the order of its rows whole', async () => {
    const spy = vi.spyOn(axes, 'readAxes');
    await readCellWriteHead(kit.sql.env, 'book', 'bookSheet', cellsAt(rows[1]!));
    expect(spy.mock.calls.map((c) => c[3])).toEqual(['c']);
  });

  it('reads a sheet whose order is still in its layout whole', async () => {
    kit.sql.sql.exec("DELETE FROM sheet_axes WHERE sheet_id = 'bookSheet'");
    kit.sql.sql.exec(
      `UPDATE sheets SET layout = json_set(layout, '$.rows', json('${JSON.stringify(rows)}'), '$.cols', json('${JSON.stringify(cols)}')) WHERE id = 'bookSheet'`,
    );
    const head = await readCellWriteHead(kit.sql.env, 'book', 'bookSheet', cellsAt(rows[1]!));
    expect(head!.layout.rows).toEqual(rows);
  });

  it('finds no sheet that is not there', async () => {
    expect(await readCellWriteHead(kit.sql.env, 'book', 'nope00', cellsAt(rows[1]!))).toBeNull();
    // Its chunks without its row (a sheet deleted between the reads).
    kit.sql.sql.exec('PRAGMA foreign_keys = OFF');
    kit.sql.sql.exec("DELETE FROM sheets WHERE id = 'bookSheet'");
    expect(await readCellWriteHead(kit.sql.env, 'book', 'bookSheet', cellsAt(rows[1]!))).toBeNull();
  });
});

describe('a cell write against the rows it reads', () => {
  it('holds a value to the rule whose range covers it, and not one outside it', async () => {
    const rule = {
      id: 'rule01',
      r1: rows[2]!,
      c1: cols[0]!,
      r2: rows[6]!,
      c2: cols[0]!,
      is: 'list' as const,
      opts: [{ v: 'Done' }],
    };
    await kit.write('book', { kind: 'layout', changes: [{ k: 'vrule', id: 'rule01', rule }] });
    const text = (r: string): SheetWrite => ({
      kind: 'cells',
      cells: [{ r, c: cols[0]!, i: { s: 'Nope' } }],
    });
    expect((await kit.write('book', text(rows[5]!))).status).toBe(400);
    expect((await kit.write('book', text(rows[7]!))).status).toBe(200);
    expect((await kit.write('book', text(rows[1]!))).status).toBe(200);
  });

  it('still refuses a cell write of the wrong shape by name', async () => {
    const odd = { kind: 'cells', cells: 'x' } as unknown as SheetWrite;
    expect((await kit.write('book', odd)).status).toBe(400);
    const noRow = { kind: 'cells', cells: [{ c: cols[0], i: { n: 1 } }] } as unknown as SheetWrite;
    expect(await (await kit.write('book', noRow)).json()).toMatchObject({
      error: 'axis_id_invalid',
    });
  });

  it('lands nothing, and refuses nothing, for a row someone deleted', async () => {
    const res = await kit.write('book', cellsAt('gone01'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: { kind: 'cells', cells: [] } });
  });
});
