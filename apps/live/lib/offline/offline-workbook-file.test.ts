// docs/specs/029-sheets/sheet-store.md "Offline documents", files-and-print.md "Downloading": an offline spreadsheet
// downloads as the same file the api writes, written in this browser.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyLayout, WorkbookRecord, type SheetJson } from '@livedoc/sheets';
import { readOds, readXlsx } from '@livedoc/sheets/files';
import { __setOfflineBackend, offlinePutRecord } from './offline-store';
import { memBackend, testRecord } from './offline-test-utils';
import { offlineWorkbookFile } from './offline-workbook-file';

let n = 3;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const layout = emptyLayout(rand, 3, 2);
const ME = { id: 'me', name: 'Me', color: '#000000' };
const sheet = (id: string, tabId: string, title: string, cells: SheetJson['cells']): SheetJson => ({
  id,
  tabId,
  title,
  layout,
  cells,
  rev: 1,
  createdAt: 1,
  updatedAt: 1,
  updatedBy: ME,
});
const workbook = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

beforeEach(() => __setOfflineBackend(memBackend()));
afterEach(() => __setOfflineBackend(null));

describe('offlineWorkbookFile', () => {
  it('writes the sheets in tab order, values worked out, named after the document', async () => {
    const [r0] = layout.rows;
    const [c0, c1] = layout.cols;
    await offlinePutRecord(
      testRecord({
        name: 'Q3 / Budget',
        workbook,
        sheets: [
          sheet('sheetTwo1', 't2', 'Costs', [{ r: r0!, c: c0!, i: { n: 21 } }]),
          sheet('sheetOne1', 't1', 'Sum', [
            {
              r: r0!,
              c: c1!,
              i: { f: { t: '@0*2', r: [{ s: 'sheetTwo1', r1: r0!, c1: c0! }] } },
            },
          ]),
        ],
      }),
    );
    const { blob, fileName } = await offlineWorkbookFile('d1', 'ods');
    expect(fileName).toBe('Q3 Budget.ods');
    const read = await readOds(new Uint8Array(await blob.arrayBuffer()));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.file.sheets.map((s) => s.name)).toEqual(['Sum', 'Costs']);
    expect(read.file.sheets[0]!.cells[0]).toMatchObject({ value: { k: 'n', v: 42 } });
  });

  it('writes the flat form too', async () => {
    await offlinePutRecord(testRecord({ workbook, sheets: [sheet('sheetOne1', 't1', 'S', [])] }));
    const { blob, fileName } = await offlineWorkbookFile('d1', 'fods');
    expect(fileName).toBe('Doc.fods');
    expect(await blob.text()).toContain('office:document');
  });

  it('writes an XLSX workbook as XLSX', async () => {
    const [r0] = layout.rows;
    const [c0] = layout.cols;
    await offlinePutRecord(
      testRecord({
        workbook: WorkbookRecord.withFormat(workbook, 'xlsx'),
        sheets: [sheet('sheetOne1', 't1', 'S', [{ r: r0!, c: c0!, i: { s: 'rent' } }])],
      }),
    );
    const { blob, fileName } = await offlineWorkbookFile('d1', 'xlsx');
    expect(fileName).toBe('Doc.xlsx');
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const read = await readXlsx(new Uint8Array(await blob.arrayBuffer()));
    expect(read.ok && read.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 's', v: 'rent' } },
    ]);
    // files-and-print.md "Download": the other standard is a converted copy.
    const copy = await readOds(
      new Uint8Array(await (await offlineWorkbookFile('d1', 'ods')).blob.arrayBuffer()),
    );
    expect(copy.ok && copy.file.sheets[0]!.cells).toEqual([
      { r: 0, c: 0, value: { k: 's', v: 'rent' } },
    ]);
  });

  it('refuses a document that is no spreadsheet', async () => {
    await offlinePutRecord(testRecord());
    await expect(offlineWorkbookFile('d1', 'ods')).rejects.toMatchObject({
      code: 'workbook_not_found',
    });
  });
});
