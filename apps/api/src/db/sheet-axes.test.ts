import { beforeEach, describe, expect, it } from 'vitest';
import { AXIS_CHUNK_GAP, AXIS_CHUNK_IDS } from '@livedoc/sheets';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { axisWriteStatements, layoutWithAxes, NO_AXES, readAxes } from './sheet-axes';
import { readSheetHead } from './sheets';

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet" (Layout): a sheet's order in chunks of `sheet_axes`, a
// write storing only the chunks it changed, an order stored before the chunks still read from its layout.

let sql: SqliteD1;

const ids = (n: number, tag = 'r') => Array.from({ length: n }, (_, i) => `${tag}${i}`);

function sheetRow(layout: object) {
  sql.sql.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('doc', 0, 0)`);
  sql.sql
    .prepare(
      `INSERT INTO sheets (document_id, id, tab_id, title, layout, rev, created_at, updated_at, updated_by)
       VALUES ('doc', 'sheet1', 't', 'S', ?, 0, 0, 0, '{}')`,
    )
    .run(JSON.stringify(layout));
}

const chunkRows = () =>
  sql.sql
    .prepare(`SELECT axis, chunk, json_array_length(ids) AS n FROM sheet_axes ORDER BY axis, chunk`)
    .all()
    .map((row) => ({ ...row }));

beforeEach(() => {
  sql = sqliteD1();
});

describe('sheet axes', () => {
  it('stores an order in chunks and reads it back whole', async () => {
    sheetRow({});
    const rows = ids(AXIS_CHUNK_IDS + 10);
    const layout = { rows, cols: ids(3, 'c') };
    await sql.env.DOCUMENT_DB.batch(axisWriteStatements(sql.env, 'doc', 'sheet1', NO_AXES, layout));
    expect(chunkRows()).toEqual([
      { axis: 'c', chunk: 0, n: 3 },
      { axis: 'r', chunk: 0, n: AXIS_CHUNK_IDS },
      { axis: 'r', chunk: AXIS_CHUNK_GAP, n: 10 },
    ]);
    const head = await readSheetHead(sql.env, 'doc', 'sheet1');
    expect(head!.layout.rows).toEqual(rows);
    expect(head!.layout.cols).toEqual(layout.cols);
  });

  it('rewrites only the chunk a change falls in, and only if the write landed', async () => {
    sheetRow({});
    const rows = ids(AXIS_CHUNK_IDS + 10);
    await sql.env.DOCUMENT_DB.batch(
      axisWriteStatements(sql.env, 'doc', 'sheet1', NO_AXES, { rows, cols: [] }),
    );
    const before = (await readAxes(sql.env, 'doc', ['sheet1'])).get('sheet1')!;
    const after = { rows: [...rows, 'tail'], cols: [] };
    const stale = axisWriteStatements(sql.env, 'doc', 'sheet1', before, after, 'not-landed');
    expect(stale).toHaveLength(1);
    await sql.env.DOCUMENT_DB.batch(stale);
    expect(chunkRows()[1]).toEqual({ axis: 'r', chunk: AXIS_CHUNK_GAP, n: 10 });
    await sql.env.DOCUMENT_DB.batch(axisWriteStatements(sql.env, 'doc', 'sheet1', before, after));
    expect(chunkRows()[1]).toEqual({ axis: 'r', chunk: AXIS_CHUNK_GAP, n: 11 });
    const emptied = { rows: rows.slice(0, AXIS_CHUNK_IDS), cols: [] };
    await sql.env.DOCUMENT_DB.batch(axisWriteStatements(sql.env, 'doc', 'sheet1', before, emptied));
    expect(chunkRows()).toEqual([{ axis: 'r', chunk: 0, n: AXIS_CHUNK_IDS }]);
  });

  it('reads an order stored before the chunks from its layout', async () => {
    sheetRow({ rows: ['a', 'b'], cols: ['x'], frozenRows: 1 });
    const head = await readSheetHead(sql.env, 'doc', 'sheet1');
    expect(head!.layout).toEqual({ rows: ['a', 'b'], cols: ['x'], frozenRows: 1 });
    expect(layoutWithAxes({} as never, NO_AXES)).toEqual({ rows: [], cols: [] });
  });

  it('reads a chunk that is not a list of ids as empty, and says so', async () => {
    sheetRow({});
    sql.sql.exec(
      `INSERT INTO sheet_axes VALUES ('doc', 'sheet1', 'r', 0, 'nonsense'), ('doc', 'sheet1', 'c', 0, '{"a":1}')`,
    );
    const head = await readSheetHead(sql.env, 'doc', 'sheet1');
    expect(head!.layout.rows).toEqual([]);
    expect(head!.layout.cols).toEqual([]);
  });
});
