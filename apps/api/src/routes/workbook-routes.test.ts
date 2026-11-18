import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentResponse } from '@livedoc/api-schema';
import { emptyLayout, WorkbookRecord } from '@livedoc/sheets';
import { readOds } from '@livedoc/sheets/files';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import { makeTestRouteContext } from './test-route-context';
import { handleDocuments } from './documents';
import { workbookFileName } from './workbook-routes';

// A spreadsheet made by the create, read by the document read, and downloaded as ODF
// (docs/specs/029-sheets/spreadsheet.md "Making a spreadsheet", sheet-store.md "In a spreadsheet", files-and-print.md).

let sql: SqliteD1;

type Call = { method?: string; path: string; body?: unknown; owner?: string; code?: string };

async function call({
  method = 'POST',
  path,
  body,
  owner = 'owner',
  code,
}: Call): Promise<Response> {
  const pending: Promise<unknown>[] = [];
  const ctx = makeTestRouteContext(method, `/api/documents${path}`, {
    env: sql.env,
    owner,
    ...(code ? { headers: { 'X-Share-Code': code } } : {}),
    ...(body === undefined ? {} : { body }),
    waitUntil: (p) => void pending.push(p),
  });
  const res = await handleDocuments(ctx);
  await Promise.all(pending);
  return res;
}

let n = 7;
const rand = () => (n = (n * 16807 + 11) % 2147483647) / 2147483647;
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'Europe/London' });
const layout = emptyLayout(rand, 10, 4);

function spreadsheet(extra: Record<string, unknown> = {}) {
  return {
    id: 'book1',
    name: 'Q3 / Budget',
    tabs: [{ id: 'tab1', name: 'Sheet1', kind: 'sheet', elements: [] }],
    sheets: [
      {
        id: 'sheetBk1',
        tabId: 'tab1',
        title: 'Sheet1',
        layout,
        cells: [
          { r: layout.rows[0], c: layout.cols[0], i: { n: 21 } },
          {
            r: layout.rows[0],
            c: layout.cols[1],
            i: { f: { t: '@0*2', r: [{ r1: layout.rows[0], c1: layout.cols[0] }] } },
          },
          { r: layout.rows[1], c: layout.cols[0], i: { s: 'rent' } },
        ],
      },
    ],
    workbook: record,
    ...extra,
  };
}

beforeEach(() => {
  n = 7;
  sql = sqliteD1();
  (sql.env as unknown as { DOCUMENT_ROOM: unknown }).DOCUMENT_ROOM = {
    idFromName: (x: string) => x,
    get: () => ({ fetch: async () => new Response(null, { status: 204 }) }),
  };
  sql.sql.exec(
    "INSERT INTO participants (id, name, color, created_at) VALUES ('owner', 'Webber', '#3b82f6', 1);",
  );
});

describe('making a spreadsheet', () => {
  it('stores its workbook row and hands it on with the document', async () => {
    expect((await call({ path: '', body: spreadsheet() })).status).toBeLessThan(300);
    const read = await (await call({ method: 'GET', path: '/book1' })).json<DocumentResponse>();
    expect(read.document.workbook).toEqual(record);
  });

  // spreadsheet.md "The workbook shape": a sheet tab is its sheet, so the sheet is referenced and never expires.
  it('keeps its sheets referenced by their tabs', async () => {
    await call({ path: '', body: spreadsheet() });
    const row = {
      ...(sql.sql
        .prepare("SELECT unreferenced_since FROM sheets WHERE id = 'sheetBk1'")
        .get() as object),
    };
    expect(row).toEqual({ unreferenced_since: null });
  });

  it('reads no workbook for any other document', async () => {
    await call({
      path: '',
      body: { id: 'plain1', name: 'Plain', tabs: [{ id: 'tp', name: 'One', elements: [] }] },
    });
    const read = await (await call({ method: 'GET', path: '/plain1' })).json<DocumentResponse>();
    expect(read.document.workbook).toBeNull();
  });

  it.each([
    ['a record that is not one', { workbook: { format: 'numbers' } }, 'workbook_invalid'],
    [
      'a tab of another kind',
      { tabs: [{ id: 'tab1', name: 'Board', elements: [] }] },
      'tab_kind_mixed',
    ],
    ['no tabs', { tabs: [], sheets: [] }, 'tab_kind_mixed'],
  ])('refuses %s', async (_, extra, error) => {
    const res = await call({ path: '', body: spreadsheet(extra) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});

describe('downloading a spreadsheet', () => {
  beforeEach(async () => {
    await call({ path: '', body: spreadsheet() });
  });

  // files-and-print.md "Downloading": the file in its own format, every formula beside the value it shows.
  it('writes the workbook as an ODF package with its values worked out', async () => {
    const res = await call({ method: 'GET', path: '/book1/workbook/file' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.oasis.opendocument.spreadsheet');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Q3 Budget.ods"');
    const read = await readOds(new Uint8Array(await res.arrayBuffer()));
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets).toEqual([
      {
        name: 'Sheet1',
        rows: 2,
        cols: 2,
        cells: [
          { r: 0, c: 0, value: { k: 'n', v: 21 } },
          { r: 0, c: 1, formula: '=A1*2', value: { k: 'n', v: 42 } },
          { r: 1, c: 0, value: { k: 's', v: 'rent' } },
        ],
      },
    ]);
  });

  it('writes the flat form when asked', async () => {
    const res = await call({ method: 'GET', path: '/book1/workbook/file?format=fods' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('table:formula="of:=[.A1]*2"');
  });

  it.each([
    ['another standard', '?format=xlsx', 409, 'format_not_native'],
    ['a format that is none', '?format=pdf', 400, 'file_type_unknown'],
  ])('refuses %s', async (_, query, status, error) => {
    const res = await call({ method: 'GET', path: `/book1/workbook/file${query}` });
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
  });

  it('refuses a document that is no spreadsheet', async () => {
    await call({
      path: '',
      body: { id: 'plain1', name: 'Plain', tabs: [{ id: 'tp', name: 'One', elements: [] }] },
    });
    const res = await call({ method: 'GET', path: '/plain1/workbook/file' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'workbook_not_found' });
  });

  it('gives a stranger nothing and a tab-scoped link no file', async () => {
    expect(
      (await call({ method: 'GET', path: '/book1/workbook/file', owner: 'stranger' })).status,
    ).toBe(403);
    sql.sql.exec(
      "INSERT INTO share_links (code, document_id, role, tab_id, created_at) VALUES ('TAB1', 'book1', 'view', 'tab1', 1);",
    );
    const scoped = await call({
      method: 'GET',
      path: '/book1/workbook/file?tabId=tab1',
      owner: 'visitor',
      code: 'TAB1',
    });
    expect(scoped.status).toBe(403);
  });

  it('answers only its own doors', async () => {
    expect((await call({ method: 'POST', path: '/book1/workbook/file' })).status).toBe(405);
    expect((await call({ method: 'GET', path: '/book1/workbook/other' })).status).toBe(404);
  });
});

describe('workbookFileName', () => {
  it('names the file after the document, safe in a header', () => {
    expect(workbookFileName('Q3 / "Budget"', 'ods')).toBe('Q3 Budget.ods');
    expect(workbookFileName('  ', 'fods')).toBe('Untitled spreadsheet.fods');
  });
});
