// An offline document's sheet store (docs/specs/029-sheets/sheet-store.md "Offline documents"): the sheets live in
// the record, every write is the api's own transition, and refusals are the api's.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DOCUMENT_SHEETS_MAX,
  SHEET_ROWS_MAX,
  SHEET_SIZED_AXES_MAX,
  WORKBOOK_ROWS_MAX,
  WorkbookRecord,
  type SheetJson,
} from '@livedoc/sheets';
import { __setOfflineBackend, offlineGetRecord, offlinePutRecord } from './offline-store';
import { memBackend, testRecord } from './offline-test-utils';
import {
  offlineCreateSheet,
  offlineDeleteSheet,
  offlineFetchSheets,
  offlineWriteSheet,
} from './offline-sheets';

const ME = { id: 'me', name: 'Me', color: '#2563eb' };
const layout = { rows: ['aaaa', 'bbbb'], cols: ['cccc', 'dddd'] };
// Past the sized-lines limit (SHEET_SIZED_AXES_MAX): a sheet the size checks call full.
const crowded = {
  ...layout,
  rowSize: Object.fromEntries(
    Array.from({ length: SHEET_SIZED_AXES_MAX + 1 }, (_, i) => [
      `s${String(i).padStart(5, '0')}`,
      30,
    ]),
  ),
};
const stored = (id: string, tabId: string, title = id): SheetJson => ({
  id,
  tabId,
  title,
  layout,
  cells: [{ r: 'aaaa', c: 'cccc', i: { n: 1 } }],
  rev: 3,
  createdAt: 1,
  updatedAt: 1,
  updatedBy: ME,
});

beforeEach(() => __setOfflineBackend(memBackend()));
afterEach(() => __setOfflineBackend(null));

describe('offlineFetchSheets', () => {
  it('reads none from a record written before sheets, or no record', async () => {
    await offlinePutRecord(testRecord());
    expect(await offlineFetchSheets('d1', null)).toEqual([]);
    expect(await offlineFetchSheets('nope', { tabId: 't1' })).toEqual([]);
  });

  it('reads every sheet, a tab, or named ones', async () => {
    const sheets = [
      stored('sheetAAAA', 't1'),
      stored('sheetBBBB', 't2'),
      stored('sheetCCCC', 't1'),
    ];
    await offlinePutRecord(testRecord({ sheets }));
    expect(await offlineFetchSheets('d1', null)).toHaveLength(3);
    expect((await offlineFetchSheets('d1', { tabId: 't1' })).map((s) => s.id)).toEqual([
      'sheetAAAA',
      'sheetCCCC',
    ]);
    expect(
      (await offlineFetchSheets('d1', { ids: ['sheetBBBB', 'missing01'] })).map((s) => s.id),
    ).toEqual(['sheetBBBB']);
  });
});

describe('offlineCreateSheet', () => {
  it('makes a sheet in the record, with an id made when none is given', async () => {
    await offlinePutRecord(testRecord());
    const made = await offlineCreateSheet('d1', { tabId: 't1', title: 'Budget' }, ME);
    expect(made).toMatchObject({ tabId: 't1', title: 'Budget', rev: 0, cells: [], updatedBy: ME });
    expect(made.id).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(made.layout.rows.length).toBeGreaterThan(0);
    expect((await offlineGetRecord('d1'))?.sheets?.map((s) => s.id)).toEqual([made.id]);
  });

  it('copies a sheet in the record', async () => {
    await offlinePutRecord(testRecord({ sheets: [stored('sheetAAAA', 't1')] }));
    const copy = await offlineCreateSheet(
      'd1',
      { id: 'sheetCOPY', tabId: 't2', title: 'Copy', copyOf: 'sheetAAAA' },
      ME,
    );
    expect(copy).toMatchObject({ id: 'sheetCOPY', tabId: 't2', rev: 0, layout });
    expect(copy.cells).toEqual(stored('sheetAAAA', 't1').cells);
  });

  it('keeps a sheet still stored on a restore, and makes one that is gone', async () => {
    await offlinePutRecord(testRecord({ sheets: [stored('sheetAAAA', 't1')] }));
    const kept = await offlineCreateSheet(
      'd1',
      { id: 'sheetAAAA', tabId: 't1', title: 'Other', restore: true },
      ME,
    );
    expect(kept).toEqual(stored('sheetAAAA', 't1'));
    await expect(
      offlineCreateSheet('d1', { id: 'sheetAAAA', tabId: 't2', title: 'X', restore: true }, ME),
    ).rejects.toMatchObject({ code: 'sheet_exists' });
    const made = await offlineCreateSheet(
      'd1',
      { id: 'sheetBBBB', tabId: 't1', title: 'Back', layout, restore: true },
      ME,
    );
    expect(made).toMatchObject({ id: 'sheetBBBB', title: 'Back' });
  });

  it('takes the layout and cells given', async () => {
    await offlinePutRecord(testRecord());
    const made = await offlineCreateSheet(
      'd1',
      {
        id: 'sheetAAAA',
        tabId: 't1',
        title: 'X',
        layout,
        cells: [{ r: 'bbbb', c: 'dddd', i: { s: 'hi' } }],
      },
      ME,
    );
    expect(made.cells).toEqual([{ r: 'bbbb', c: 'dddd', i: { s: 'hi' } }]);
  });

  it('refuses as the api does', async () => {
    await offlinePutRecord(testRecord({ sheets: [stored('sheetAAAA', 't1', 'Taken')] }));
    await expect(
      offlineCreateSheet('d1', { id: 'sheetAAAA', tabId: 't1', title: 'New' }, ME),
    ).rejects.toMatchObject({ status: 409, code: 'sheet_exists' });
    await expect(
      offlineCreateSheet('d1', { id: 'sheetBBBB', tabId: 't1', title: 'taken' }, ME),
    ).rejects.toMatchObject({ status: 409, code: 'sheet_title_taken' });
    // The same title on another tab is fine.
    await expect(
      offlineCreateSheet('d1', { id: 'sheetBBBB', tabId: 't2', title: 'Taken' }, ME),
    ).resolves.toMatchObject({ id: 'sheetBBBB' });
    await expect(
      offlineCreateSheet(
        'd1',
        { id: 'sheetCCCC', tabId: 't1', title: 'C', copyOf: 'gone00001' },
        ME,
      ),
    ).rejects.toMatchObject({ status: 404, code: 'sheet_not_found' });
    await expect(
      offlineCreateSheet('d1', { id: 'bad id', tabId: 't1', title: 'C' }, ME),
    ).rejects.toMatchObject({ status: 400, code: 'write_invalid' });
    await expect(offlineCreateSheet('nope', { tabId: 't1', title: 'C' }, ME)).rejects.toMatchObject(
      { status: 404, code: 'not_found' },
    );
    await offlinePutRecord(testRecord({ id: 'd2', trashedAt: 5 }));
    await expect(offlineCreateSheet('d2', { tabId: 't1', title: 'C' }, ME)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses a document already holding the most sheets', async () => {
    const sheets = Array.from({ length: DOCUMENT_SHEETS_MAX }, (_, i) =>
      stored(`sheet${String(i).padStart(4, '0')}`, 't1'),
    );
    await offlinePutRecord(testRecord({ sheets }));
    await expect(
      offlineCreateSheet('d1', { id: 'sheetMORE', tabId: 't1', title: 'More' }, ME),
    ).rejects.toMatchObject({ status: 413, code: 'sheets_full' });
  });

  it('refuses a sheet past a size limit as 413, and a malformed one as 400', async () => {
    await offlinePutRecord(testRecord());
    await expect(
      offlineCreateSheet(
        'd1',
        { id: 'sheetFULL', tabId: 't1', title: 'Full', layout: crowded },
        ME,
      ),
    ).rejects.toMatchObject({ status: 413, code: 'sheet_full' });
    const rows = Array.from({ length: 10_001 }, (_, i) => `r${String(i).padStart(5, '0')}`);
    await expect(
      offlineCreateSheet(
        'd1',
        { id: 'sheetHUGE', tabId: 't1', title: 'Huge', layout: { rows, cols: ['cccc'] } },
        ME,
      ),
    ).rejects.toMatchObject({ status: 400, code: 'sheet_too_large' });
  });
});

describe('offlineWriteSheet', () => {
  beforeEach(async () => {
    await offlinePutRecord(
      testRecord({ sheets: [stored('sheetAAAA', 't1', 'One'), stored('sheetBBBB', 't1', 'Two')] }),
    );
  });

  it('applies a cells write and answers with the cells it touched', async () => {
    const answer = await offlineWriteSheet(
      'd1',
      'sheetAAAA',
      { write: { kind: 'cells', cells: [{ r: 'bbbb', c: 'dddd', i: { s: 'x' } }] } },
      ME,
    );
    expect(answer.rev).toBe(4);
    expect(answer.cells).toEqual([{ r: 'bbbb', c: 'dddd', i: { s: 'x' } }]);
    const rec = await offlineGetRecord('d1');
    expect(rec?.sheets?.[0]?.cells).toHaveLength(2);
    expect(rec?.sheets?.[1]?.rev).toBe(3);
  });

  it('renames, trimmed, answering with no cells', async () => {
    const answer = await offlineWriteSheet(
      'd1',
      'sheetAAAA',
      { write: { kind: 'title', title: '  Renamed  ' } },
      ME,
    );
    expect(answer.cells).toEqual([]);
    expect((await offlineGetRecord('d1'))?.sheets?.[0]?.title).toBe('Renamed');
  });

  it('answers a layout write with no cells', async () => {
    const answer = await offlineWriteSheet(
      'd1',
      'sheetAAAA',
      {
        write: { kind: 'layout', changes: [{ k: 'hide', axis: 'r', ids: ['aaaa'], hidden: true }] },
      },
      ME,
    );
    expect(answer.cells).toEqual([]);
    expect(answer.applied.kind).toBe('layout');
  });

  it('refuses a write that grows a sheet already past a limit as 413', async () => {
    await offlinePutRecord(
      testRecord({ sheets: [{ ...stored('sheetAAAA', 't1'), layout: crowded }] }),
    );
    await expect(
      offlineWriteSheet(
        'd1',
        'sheetAAAA',
        { write: { kind: 'cells', cells: [{ r: 'aaaa', c: 'cccc', i: { n: 2 } }] } },
        ME,
      ),
    ).rejects.toMatchObject({ status: 413, code: 'sheet_full' });
  });

  it('refuses as the api does', async () => {
    await expect(
      offlineWriteSheet('d1', 'sheetAAAA', { write: { kind: 'title', title: 'two' } }, ME),
    ).rejects.toMatchObject({ status: 409, code: 'sheet_title_taken' });
    // Its own title, cased differently, is not taken.
    await expect(
      offlineWriteSheet('d1', 'sheetAAAA', { write: { kind: 'title', title: 'ONE' } }, ME),
    ).resolves.toBeDefined();
    await expect(
      offlineWriteSheet('d1', 'missing01', { write: { kind: 'title', title: 'X' } }, ME),
    ).rejects.toMatchObject({ status: 404, code: 'sheet_not_found' });
    await expect(
      offlineWriteSheet(
        'd1',
        'sheetAAAA',
        {
          write: { kind: 'cells', cells: [{ r: 'aaaa', c: 'cccc', i: { s: 'x'.repeat(10_001) } }] },
        },
        ME,
      ),
    ).rejects.toMatchObject({ status: 400, code: 'input_too_long' });
    await expect(
      offlineWriteSheet('nope', 'sheetAAAA', { write: { kind: 'title', title: 'X' } }, ME),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});

describe('offlineDeleteSheet', () => {
  it('removes the sheet from the record, and refuses one not there', async () => {
    await offlinePutRecord(testRecord({ sheets: [stored('sheetAAAA', 't1')] }));
    await offlineDeleteSheet('d1', 'sheetAAAA');
    expect((await offlineGetRecord('d1'))?.sheets).toEqual([]);
    await expect(offlineDeleteSheet('d1', 'sheetAAAA')).rejects.toMatchObject({
      status: 404,
      code: 'sheet_not_found',
    });
  });

  it('refuses on a record with no sheets field', async () => {
    await offlinePutRecord(testRecord());
    await expect(offlineDeleteSheet('d1', 'sheetAAAA')).rejects.toMatchObject({ status: 404 });
  });
});

// docs/specs/029-sheets/sheet-store.md "Offline documents": an offline spreadsheet keeps every rule of the api's, minus
// the room: its sheets are its tabs', named and limited as one workbook, a sheet renamed with its tab.
describe('an offline spreadsheet', () => {
  const workbook = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
  const book = (sheets: SheetJson[]) => testRecord({ sheets, workbook });

  it("reads its tabs' sheets in tab order, leaving out a deleted tab's", async () => {
    await offlinePutRecord(
      book([
        stored('sheetBBBB', 't2', 'Two'),
        stored('sheetGONE', 'gone'),
        stored('sheetAAAA', 't1', 'One'),
      ]),
    );
    expect((await offlineFetchSheets('d1', null)).map((s) => s.id)).toEqual([
      'sheetAAAA',
      'sheetBBBB',
    ]);
  });

  // The workbook's names stay with the original (sheet.md D298); a Plan Sheet's copy keeps its own.
  it('copies a sheet without its named ranges, which are the workbook’s', async () => {
    const names = [{ name: 'Rate', r1: 'aaaa', c1: 'cccc', r2: 'aaaa', c2: 'cccc' }];
    const named = { ...stored('sheetAAAA', 't1', 'One'), layout: { ...layout, names } };
    await offlinePutRecord(book([named]));
    const copy = await offlineCreateSheet(
      'd1',
      { id: 'sheetCOPY', tabId: 't2', title: 'Two', copyOf: 'sheetAAAA' },
      ME,
    );
    expect(copy.layout).toEqual(layout);
    await offlinePutRecord(testRecord({ sheets: [named] }));
    const plan = await offlineCreateSheet(
      'd1',
      { id: 'sheetPLAN', tabId: 't2', title: 'Two', copyOf: 'sheetAAAA' },
      ME,
    );
    expect(plan.layout.names).toEqual(names);
  });

  // data-tools.md "Tables" "Copies" (D451): a sheet landing in a workbook takes table names free of its others'.
  it("renames a copy's tables, and a carried-in sheet's, free of the workbook's", async () => {
    const tables = [
      { id: 'tbl001', name: 'Sales', r1: 'aaaa', c1: 'cccc', r2: 'bbbb', c2: 'cccc' },
    ];
    const held = { ...stored('sheetAAAA', 't1', 'One'), layout: { ...layout, tables } };
    await offlinePutRecord(book([held]));
    const copy = await offlineCreateSheet(
      'd1',
      { id: 'sheetCOPY', tabId: 't2', title: 'Two', copyOf: 'sheetAAAA' },
      ME,
    );
    expect(copy.layout.tables).toEqual([{ ...tables[0], name: 'Sales_2' }]);
    const carried = await offlineCreateSheet(
      'd1',
      { id: 'sheetSEED', tabId: 't3', title: 'Three', layout: held.layout },
      ME,
    );
    expect(carried.layout.tables).toEqual([{ ...tables[0], name: 'Sales_3' }]);
  });

  it('names a new sheet by the workbook, case aside, and by the name rules', async () => {
    await offlinePutRecord(book([stored('sheetAAAA', 't1', 'Costs')]));
    await expect(
      offlineCreateSheet('d1', { tabId: 't2', title: 'COSTS' }, ME),
    ).rejects.toMatchObject({
      status: 409,
      code: 'sheet_name_taken',
    });
    await expect(offlineCreateSheet('d1', { tabId: 't2', title: 'a/b' }, ME)).rejects.toMatchObject(
      {
        status: 400,
        code: 'sheet_name_invalid',
      },
    );
  });

  it("renames a sheet's tab with it, refusing another sheet's name", async () => {
    await offlinePutRecord(
      book([stored('sheetAAAA', 't1', 'One'), stored('sheetBBBB', 't2', 'Two')]),
    );
    await offlineWriteSheet('d1', 'sheetAAAA', { write: { kind: 'title', title: ' Costs ' } }, ME);
    const rec = await offlineGetRecord('d1');
    expect(rec?.tabs.find((t) => t.id === 't1')?.name).toBe('Costs');
    expect(rec?.sheets?.find((s) => s.id === 'sheetAAAA')?.title).toBe('Costs');
    await expect(
      offlineWriteSheet('d1', 'sheetBBBB', { write: { kind: 'title', title: 'costs' } }, ME),
    ).rejects.toMatchObject({ code: 'sheet_name_taken' });
  });

  it("grows a sheet past a Plan Sheet's rows, and refuses rows past the workbook's", async () => {
    await offlinePutRecord(book([stored('sheetAAAA', 't1', 'One')]));
    const rows = (n: number, p: string) =>
      Array.from({ length: n }, (_, i) => `${p}${String(i).padStart(7, '0')}`);
    const insert = (ids: string[]) =>
      offlineWriteSheet(
        'd1',
        'sheetAAAA',
        { write: { kind: 'layout', changes: [{ k: 'insertRows', after: null, ids }] } },
        ME,
      );
    await insert(rows(SHEET_ROWS_MAX, 'a'));
    const grown = (await offlineGetRecord('d1'))?.sheets?.[0]?.layout.rows.length;
    expect(grown).toBe(SHEET_ROWS_MAX + 2);
    // Another sheet holding the rest of the workbook's rows: one more row passes them.
    const rec = (await offlineGetRecord('d1'))!;
    const big = stored('sheetBBBB', 't2', 'Big');
    big.layout = { rows: rows(WORKBOOK_ROWS_MAX - grown!, 'b'), cols: ['cccc'] };
    await offlinePutRecord({ ...rec, sheets: [...rec.sheets!, big] });
    await expect(insert(['zzzz0001'])).rejects.toMatchObject({
      status: 413,
      code: 'workbook_full',
    });
  });
});
