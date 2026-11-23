import { beforeEach, describe, expect, it } from 'vitest';
import type { DocumentResponse } from '@livedoc/api-schema';
import { emptyLayout, WorkbookRecord } from '@livedoc/sheets';
import { readOds, readXlsx } from '@livedoc/sheets/files';
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

  // sheet-store.md "Copies and exports": a copy of a spreadsheet is a spreadsheet, its sheets still its tabs'.
  it('stays a spreadsheet when copied', async () => {
    await call({ path: '', body: spreadsheet() });
    const res = await call({ path: '/book1/copy', body: {} });
    expect(res.status).toBeLessThan(300);
    const { document: copied } = await res.json<{ document: { id: string } }>();
    const id = copied.id;
    const read = await (await call({ method: 'GET', path: `/${id}` })).json<DocumentResponse>();
    expect(read.document.workbook).toEqual(record);
    const unreferenced = sql.sql
      .prepare(
        'SELECT COUNT(*) AS n FROM sheets WHERE document_id = ? AND unreferenced_since IS NOT NULL',
      )
      .get(id) as { n: number };
    expect(unreferenced.n).toBe(0);
  });

  // formulas.md, the file's meaning: kept by the spreadsheet opened from a file, and by its copies.
  it('keeps a file’s meaning, made and copied', async () => {
    const opened = WorkbookRecord.opened(record, 'xlsx');
    await call({ path: '', body: spreadsheet({ workbook: opened }) });
    const read = await (await call({ method: 'GET', path: '/book1' })).json<DocumentResponse>();
    expect(read.document.workbook).toEqual(opened);
    const res = await call({ path: '/book1/copy', body: {} });
    const { document: copied } = await res.json<{ document: { id: string } }>();
    const copy = await (
      await call({ method: 'GET', path: `/${copied.id}` })
    ).json<DocumentResponse>();
    expect(copy.document.workbook?.meaning).toBe('ooxml');
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
    [
      'a sheet tab named against the rules',
      { tabs: [{ id: 'tab1', name: 'Q3: Plan', kind: 'sheet', elements: [] }] },
      'sheet_name_invalid',
    ],
    [
      'two sheet tabs of one name',
      {
        tabs: [
          { id: 'tab1', name: 'Sheet1', kind: 'sheet', elements: [] },
          { id: 'tab2', name: 'sheet1', kind: 'sheet', elements: [] },
        ],
      },
      'sheet_name_taken',
    ],
  ])('refuses %s', async (_, extra, error) => {
    const res = await call({ path: '', body: spreadsheet(extra) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});

// spreadsheet.md "The workbook shape": a spreadsheet holds only sheet tabs, whichever way a tab arrives.
describe('saving a tab into a spreadsheet', () => {
  beforeEach(async () => {
    await call({ path: '', body: spreadsheet() });
  });

  const put = (tab: Record<string, unknown>) =>
    call({ method: 'PUT', path: `/book1/tabs/${String(tab['id'])}`, body: tab });

  it('refuses a new tab of another kind', async () => {
    const res = await put({ id: 'tabB', name: 'Board', kind: 'board', elements: [] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'tab_kind_mixed' });
  });

  it('refuses turning a sheet tab into another kind', async () => {
    const res = await put({ id: 'tab1', name: 'Sheet1', elements: [] });
    expect(res.status).toBe(409);
  });

  it('takes a sheet tab, keeping its name, which is its sheet’s to change', async () => {
    const res = await put({ id: 'tab1', name: 'Renamed', kind: 'sheet', elements: [] });
    expect(res.status).toBe(200);
    const row = sql.sql.prepare("SELECT name FROM tabs WHERE id = 'tab1'").get() as {
      name: string;
    };
    expect(row.name).toBe('Sheet1');
  });

  it('leaves a document that is no spreadsheet free to hold a Plan Sheet tab beside others', async () => {
    await call({
      path: '',
      body: { id: 'plan1', name: 'Plan', tabs: [{ id: 'tq', name: 'One', elements: [] }] },
    });
    const res = await call({
      method: 'PUT',
      path: '/plan1/tabs/tq2',
      body: { id: 'tq2', name: 'Sheet', kind: 'sheet', elements: [] },
    });
    expect(res.status).toBe(200);
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
        // The sheet's own line sizes (standard-mapping.md "Rows and columns in the file"), nothing sized by hand.
        lines: {
          r: { lines: new Map(), collapsed: [], size: expect.closeTo(28, 2) },
          c: { lines: new Map(), collapsed: [], size: expect.closeTo(120, 2) },
        },
      },
    ]);
  });

  // files-and-print.md "Download" (D118): the open sheet as CSV or TSV, values as shown, named after both.
  it.each([
    ['csv', ',', 'text/csv; charset=utf-8'],
    ['tsv', '\t', 'text/tab-separated-values; charset=utf-8'],
  ])('writes the open sheet as %s', async (format, sep, type) => {
    const res = await call({
      method: 'GET',
      path: `/book1/workbook/file?format=${format}&tab=tab1`,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(type);
    expect(res.headers.get('Content-Disposition')).toBe(
      `attachment; filename="Q3 Budget - Sheet1.${format}"`,
    );
    expect(await res.text()).toBe(`21${sep}42\r\nrent${sep}\r\n`);
  });

  it('refuses a CSV of a tab that holds no sheet', async () => {
    const res = await call({ method: 'GET', path: '/book1/workbook/file?format=csv' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'sheet_not_found' });
  });

  it('writes the flat form when asked', async () => {
    const res = await call({ method: 'GET', path: '/book1/workbook/file?format=fods' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('table:formula="of:=[.A1]*2"');
  });

  // standard-mapping.md "Values in XLSX": an XLSX workbook leaves as XLSX; as ODF it is a converted copy
  // (files-and-print.md "Download").
  it('writes an XLSX workbook as XLSX, and as ODF a converted copy', async () => {
    const ods = spreadsheet();
    await call({
      path: '',
      body: {
        ...ods,
        id: 'book2',
        tabs: [{ ...ods.tabs[0]!, id: 'tab2' }],
        sheets: [{ ...ods.sheets[0]!, id: 'sheetBk2', tabId: 'tab2' }],
        workbook: WorkbookRecord.converted(record, 'xlsx'),
      },
    });
    const res = await call({ method: 'GET', path: '/book2/workbook/file' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Q3 Budget.xlsx"');
    const read = await readXlsx(new Uint8Array(await res.arrayBuffer()));
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 'n', v: 21 } },
      { r: 0, c: 1, formula: '=A1*2', value: { k: 'n', v: 42 } },
      { r: 1, c: 0, value: { k: 's', v: 'rent' } },
    ]);
    const odf = await call({ method: 'GET', path: '/book2/workbook/file?format=ods' });
    expect(odf.status).toBe(200);
    const copy = await readOds(new Uint8Array(await odf.arrayBuffer()));
    expect(copy.ok && copy.file.sheets[0]!.cells[1]!.formula).toBe('=A1*2');
  });

  it.each([['a format that is none', '?format=pdf', 400, 'file_type_unknown']])(
    'refuses %s',
    async (_, query, status, error) => {
      const res = await call({ method: 'GET', path: `/book1/workbook/file${query}` });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error });
    },
  );

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

// spreadsheet.md "The workbook shape": a spreadsheet's sheets are one workbook, their names its tabs', unique in it,
// and their formulas read across it.
describe('the sheets of one spreadsheet', () => {
  const second = emptyLayout(rand, 10, 4);
  function twoSheets() {
    return spreadsheet({
      tabs: [
        { id: 'tab1', name: 'Sheet1', kind: 'sheet', elements: [] },
        { id: 'tab2', name: 'Costs', kind: 'sheet', elements: [] },
      ],
      sheets: [
        { id: 'sheetBk1', tabId: 'tab1', title: 'Sheet1', layout, cells: [] },
        {
          id: 'sheetBk2',
          tabId: 'tab2',
          title: 'Costs',
          layout: second,
          cells: [
            {
              r: second.rows[0],
              c: second.cols[0],
              i: {
                f: {
                  t: 'SUM(@0)',
                  r: [
                    {
                      s: 'sheetBk1',
                      r1: layout.rows[3],
                      c1: layout.cols[0],
                      r2: layout.rows[5],
                      c2: layout.cols[0],
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    });
  }
  const write = (sheetId: string, w: unknown) =>
    call({ path: `/book1/sheets/${sheetId}/writes`, body: { write: w } });
  const tabName = (id: string) =>
    (sql.sql.prepare('SELECT name FROM tabs WHERE id = ?').get(id) as { name: string }).name;

  beforeEach(async () => {
    expect((await call({ path: '', body: twoSheets() })).status).toBeLessThan(300);
  });

  it('renames a sheet and its tab as one', async () => {
    const res = await write('sheetBk1', { kind: 'title', title: 'Income' });
    expect(res.status).toBe(200);
    expect(tabName('tab1')).toBe('Income');
  });

  it('refuses a name another sheet of the workbook has, on another tab', async () => {
    const res = await write('sheetBk1', { kind: 'title', title: 'costs' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'sheet_name_taken' });
    expect(tabName('tab1')).toBe('Sheet1');
  });

  it('renames from the tab rename too, by the sheet name’s rules', async () => {
    const ok = await call({
      method: 'PUT',
      path: '/book1/tabs/tab1/name',
      body: { name: 'Income' },
    });
    expect(ok.status).toBe(200);
    expect(tabName('tab1')).toBe('Income');
    const title = sql.sql.prepare("SELECT title FROM sheets WHERE id = 'sheetBk1'").get() as {
      title: string;
    };
    expect(title.title).toBe('Income');
    const taken = await call({
      method: 'PUT',
      path: '/book1/tabs/tab1/name',
      body: { name: 'Costs' },
    });
    expect(taken.status).toBe(409);
  });

  it('refuses a name against the rules', async () => {
    const res = await write('sheetBk1', { kind: 'title', title: 'Q3/Q4' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'sheet_name_invalid' });
  });

  it('shrinks a range another sheet tab reads when its first row is deleted', async () => {
    const res = await write('sheetBk1', {
      kind: 'layout',
      changes: [{ k: 'deleteRows', ids: [layout.rows[3]] }],
    });
    expect(res.status).toBe(200);
    const row = sql.sql
      .prepare("SELECT input FROM sheet_cells WHERE sheet_id = 'sheetBk2'")
      .get() as { input: string };
    expect(JSON.parse(row.input)).toMatchObject({
      f: { r: [{ s: 'sheetBk1', r1: layout.rows[4], r2: layout.rows[5] }] },
    });
  });
});
