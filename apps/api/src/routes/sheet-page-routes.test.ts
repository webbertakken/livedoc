import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetCellsResponse, WorkbookResponse, WorkbookSheetDto } from '@livedoc/api-schema';
import {
  SHEET_PAGE_ROWS,
  WORKBOOK_FIRST_ROWS,
  WorkbookRecord,
  emptyLayout,
  type SheetLayout,
  type SheetWrite,
} from '@livedoc/sheets';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import * as pages from '../db/sheet-pages';
import { makeTestRouteContext } from './test-route-context';
import { handleDocuments } from './documents';

// docs/specs/029-sheets/sheet-store.md "In a spreadsheet", Loading by viewport: the workbook opens on its first rows,
// and the rest of a sheet's cells come by pages of rows.

let sql: SqliteD1;

type Call = { method?: string; path: string; body?: unknown; owner?: string; code?: string };

async function call<T = unknown>({ method = 'GET', path, body, owner = 'owner', code }: Call) {
  const pending: Promise<unknown>[] = [];
  const ctx = makeTestRouteContext(method, `/api/documents/d1${path}`, {
    env: sql.env,
    owner,
    ...(code ? { headers: { 'X-Share-Code': code } } : {}),
    ...(body === undefined ? {} : { body }),
    waitUntil: (p) => void pending.push(p),
  });
  const res = await handleDocuments(ctx);
  await Promise.all(pending);
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

let n = 0;
const rand = () => (n = (n * 16807 + 11) % 2147483647) / 2147483647;
let tall: SheetLayout;
let short: SheetLayout;

// Row `r`'s cell in the first column holds `r`, so a page's cells name their rows.
function numbered(layout: SheetLayout, rows: number) {
  return Array.from({ length: rows }, (_, r) => ({
    r: layout.rows[r]!,
    c: layout.cols[0]!,
    i: { n: r },
  }));
}

async function sheet(id: string, tabId: string, title: string, layout: SheetLayout, cells = 0) {
  const res = await call({
    method: 'POST',
    path: '/sheets',
    body: { id, tabId, title, layout, cells: numbered(layout, cells) },
  });
  expect(res.status).toBe(201);
}

const rowsOf = (cells: { i?: unknown }[]) =>
  cells.map((c) => (c.i as { n: number }).n).sort((a, b) => a - b);

beforeEach(async () => {
  n = 7;
  sql = sqliteD1();
  (sql.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
    idFromName: (x: string) => x,
    get: () => ({ fetch: async () => new Response(null, { status: 204 }) }),
  };
  sql.sql.exec(`
    INSERT INTO documents (id, owner_id, name, shareable, saved_at, created_at) VALUES ('d1', 'owner', 'Book', 1, 1, 1);
    INSERT INTO participants (id, name, color, created_at) VALUES ('owner', 'Webber', '#3b82f6', 1);
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('t1', 'Data', '{"elements":[]}', 1);
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('t2', 'Notes', '{"elements":[]}', 1);
    INSERT INTO tabs (id, name, data, updated_at) VALUES ('t3', 'Blank', '{"elements":[]}', 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't2', 0, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't1', 1, 1);
    INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('d1', 't3', 2, 1);
    INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB2', 'd1', 'edit', 't2', 1);
  `);
  const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' });
  sql.sql
    .prepare(
      'INSERT INTO workbook (document_id, format, settings, rev, created_at, updated_at) VALUES (?, ?, ?, 0, 1, 1)',
    )
    .run('d1', record.format, JSON.stringify(record.settings));
  tall = emptyLayout(rand, 300, 3);
  short = emptyLayout(rand, 20, 3);
  await sheet('sheetData', 't1', 'Data', tall, 300);
  await sheet('sheetNote', 't2', 'Notes', short, 5);
  await sheet('sheetBlnk', 't3', 'Blank', short, 0);
});

const byId = (sheets: WorkbookSheetDto[], id: string) => sheets.find((s) => s.id === id)!;

describe('opening a workbook', () => {
  it("answers every sheet in tab order, and the first tab's first rows by default", async () => {
    const res = await call<WorkbookResponse>({ path: '/workbook' });
    expect(res.status).toBe(200);
    expect(res.body.workbook.format).toBe('ods');
    expect(res.body.sheets.map((s) => s.id)).toEqual(['sheetNote', 'sheetData', 'sheetBlnk']);
    const notes = byId(res.body.sheets, 'sheetNote');
    expect(notes).toMatchObject({ cellCount: 5, rowsLoaded: 20 });
    expect(rowsOf(notes.cells)).toEqual([0, 1, 2, 3, 4]);
    // Not opened: its head and layout, no cells.
    const data = byId(res.body.sheets, 'sheetData');
    expect(data).toMatchObject({ title: 'Data', cellCount: 300, rowsLoaded: 0, cells: [] });
    expect(data.layout.rows).toEqual(tall.rows);
    // A sheet with no cells is whole already.
    expect(byId(res.body.sheets, 'sheetBlnk')).toMatchObject({ cellCount: 0, rowsLoaded: 20 });
  });

  it("opens the asked tab's sheet on its first rows", async () => {
    const res = await call<WorkbookResponse>({ path: '/workbook?open=t1' });
    const data = byId(res.body.sheets, 'sheetData');
    expect(data.rowsLoaded).toBe(WORKBOOK_FIRST_ROWS);
    expect(rowsOf(data.cells)).toEqual(Array.from({ length: WORKBOOK_FIRST_ROWS }, (_, r) => r));
    expect(byId(res.body.sheets, 'sheetNote')).toMatchObject({ rowsLoaded: 0, cells: [] });
  });

  it('opens on as many rows as asked', async () => {
    const res = await call<WorkbookResponse>({ path: '/workbook?open=t1&rows=0-3' });
    const data = byId(res.body.sheets, 'sheetData');
    expect(data.rowsLoaded).toBe(3);
    expect(rowsOf(data.cells)).toEqual([0, 1, 2]);
  });

  it('opens the first tab when the asked one is no sheet tab', async () => {
    const res = await call<WorkbookResponse>({ path: '/workbook?open=nope' });
    expect(byId(res.body.sheets, 'sheetNote').rowsLoaded).toBe(20);
  });

  it.each([['5-10'], ['x'], [`0-${SHEET_PAGE_ROWS + 1}`]])(
    'refuses rows %s, which are no prefix of a page',
    async (rows) => {
      const res = await call<{ error: string }>({ path: `/workbook?rows=${rows}` });
      expect(res).toEqual({ status: 400, body: { error: 'rows_invalid' } });
    },
  );

  it('is no door of a document that is no spreadsheet', async () => {
    sql.sql.exec("DELETE FROM workbook WHERE document_id = 'd1'");
    const res = await call<{ error: string }>({ path: '/workbook' });
    expect(res).toEqual({ status: 404, body: { error: 'workbook_not_found' } });
  });

  it('is never reached by a tab-scoped link', async () => {
    const res = await call({ path: '/workbook?tabId=t2', owner: 'stranger', code: 'TAB2' });
    expect(res.status).toBe(403);
  });

  it('only reads', async () => {
    expect((await call({ method: 'POST', path: '/workbook', body: {} })).status).toBe(405);
  });

  it('answers a busy sheet when writes keep landing between its reads', async () => {
    const spy = vi.spyOn(pages, 'readRowPage').mockResolvedValueOnce('busy');
    const res = await call<{ error: string }>({ path: '/workbook?open=t1' });
    expect(res).toEqual({ status: 409, body: { error: 'sheet_busy' } });
    spy.mockRestore();
  });
});

describe("a page of a sheet's cells", () => {
  it('answers the cells of the rows at the asked positions, with the rev', async () => {
    const res = await call<SheetCellsResponse>({ path: '/sheets/sheetData/cells?rows=200-250' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rev: 0, from: 200, to: 250 });
    expect(rowsOf(res.body.cells)).toEqual(Array.from({ length: 50 }, (_, r) => 200 + r));
  });

  it('clamps the rows to the sheet', async () => {
    const res = await call<SheetCellsResponse>({ path: '/sheets/sheetData/cells?rows=290-900' });
    expect(res.body).toMatchObject({ from: 290, to: 300 });
    expect(res.body.cells).toHaveLength(10);
  });

  it('reads rows by their place in the order as it stands', async () => {
    const write: SheetWrite = {
      kind: 'layout',
      changes: [{ k: 'deleteRows', ids: [tall.rows[0]!] }],
    };
    expect(
      (await call({ method: 'POST', path: '/sheets/sheetData/writes', body: { write } })).status,
    ).toBe(200);
    const res = await call<SheetCellsResponse>({ path: '/sheets/sheetData/cells?rows=0-2' });
    expect(res.body.rev).toBe(1);
    expect(rowsOf(res.body.cells)).toEqual([1, 2]);
  });

  it('carries formats as the reads do', async () => {
    const write: SheetWrite = {
      kind: 'cells',
      cells: [{ r: tall.rows[0]!, c: tall.cols[0]!, f: { b: true } }],
    };
    await call({ method: 'POST', path: '/sheets/sheetData/writes', body: { write } });
    const res = await call<SheetCellsResponse>({ path: '/sheets/sheetData/cells?rows=0-1' });
    expect(res.body.cells).toEqual([
      { r: tall.rows[0], c: tall.cols[0], i: { n: 0 }, f: { b: true } },
    ]);
  });

  it('refuses rows it cannot read', async () => {
    expect(await call({ path: '/sheets/sheetData/cells' })).toEqual({
      status: 400,
      body: { error: 'rows_invalid' },
    });
    expect(
      (await call({ path: `/sheets/sheetData/cells?rows=0-${SHEET_PAGE_ROWS + 1}` })).status,
    ).toBe(400);
  });

  it('finds no sheet that is not there, nor one past a tab-scoped link', async () => {
    expect((await call({ path: '/sheets/sheetGone/cells?rows=0-5' })).status).toBe(404);
    expect((await call({ path: '/sheets/x/cells?rows=0-5' })).status).toBe(404);
    expect(
      (
        await call({
          path: '/sheets/sheetData/cells?rows=0-5&tabId=t2',
          owner: 'stranger',
          code: 'TAB2',
        })
      ).status,
    ).toBe(404);
    const own = await call<SheetCellsResponse>({
      path: '/sheets/sheetNote/cells?rows=0-5&tabId=t2',
      owner: 'stranger',
      code: 'TAB2',
    });
    expect(own.body.cells).toHaveLength(5);
  });

  it('answers a busy sheet, and a sheet gone between its reads', async () => {
    const spy = vi.spyOn(pages, 'readRowPage').mockResolvedValueOnce('busy');
    expect((await call({ path: '/sheets/sheetData/cells?rows=0-5' })).status).toBe(409);
    spy.mockResolvedValueOnce(null);
    expect((await call({ path: '/sheets/sheetData/cells?rows=0-5' })).status).toBe(404);
    spy.mockRestore();
  });

  it('only reads', async () => {
    expect(
      (await call({ method: 'POST', path: '/sheets/sheetData/cells?rows=0-5', body: {} })).status,
    ).toBe(405);
  });
});
