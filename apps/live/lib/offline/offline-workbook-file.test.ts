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
        workbook: WorkbookRecord.converted(workbook, 'xlsx'),
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

// standard-mapping.md "Unknown content" (D109): the record's kept content goes into a file of its standard only.
describe('an offline spreadsheet’s kept content', () => {
  const NAMES =
    '<table:named-expressions><table:named-range table:name="T" table:base-cell-address="$S.$A$1" table:cell-range-address="$S.$A$1"/></table:named-expressions>';
  const kept = {
    standard: 'odf' as const,
    items: [
      {
        place: 'spreadsheet-after' as const,
        xml: NAMES,
        ns: { table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0' },
        at: {},
      },
    ],
    relationships: [],
    parts: [],
  };

  it('is written into a file of its standard and left out of the other’s', async () => {
    await offlinePutRecord(
      testRecord({ workbook, kept, sheets: [sheet('sheetOne1', 't1', 'S', [])] }),
    );
    const ods = await readOds(
      new Uint8Array(await (await offlineWorkbookFile('d1', 'ods')).blob.arrayBuffer()),
    );
    expect(ods.ok && ods.file.kept?.items.map((item) => item.xml)).toEqual([NAMES]);
    const xlsx = await readXlsx(
      new Uint8Array(await (await offlineWorkbookFile('d1', 'xlsx')).blob.arrayBuffer()),
    );
    expect(xlsx.ok && JSON.stringify(xlsx.file.kept ?? null)).not.toContain('named-expressions');
  });
});

// files-and-print.md "Download" (D118): the open sheet as CSV or TSV, written in this browser as the api writes it.
describe('an offline sheet as CSV or TSV', () => {
  it.each([
    ['csv', '21\r\n', 'text/csv;charset=utf-8'],
    ['tsv', '21\r\n', 'text/tab-separated-values;charset=utf-8'],
  ] as const)('writes the sheet on the tab as %s, named after both', async (format, text, type) => {
    const [r0] = layout.rows;
    const [c0] = layout.cols;
    await offlinePutRecord(
      testRecord({
        name: 'Q3',
        workbook,
        sheets: [sheet('sheetOne1', 't1', 'Costs', [{ r: r0!, c: c0!, i: { n: 21 } }])],
      }),
    );
    const { blob, fileName } = await offlineWorkbookFile('d1', format, 't1');
    expect(fileName).toBe(`Q3 - Costs.${format}`);
    expect(blob.type).toBe(type);
    expect(await blob.text()).toBe(text);
  });

  it('names an unnamed spreadsheet’s file as untitled, and refuses a tab with no sheet', async () => {
    await offlinePutRecord(
      testRecord({ name: '', workbook, sheets: [sheet('sheetOne1', 't1', 'S', [])] }),
    );
    expect((await offlineWorkbookFile('d1', 'csv', 't1')).fileName).toBe(
      'Untitled spreadsheet - S.csv',
    );
    await expect(offlineWorkbookFile('d1', 'tsv', 'gone')).rejects.toMatchObject({
      code: 'sheet_not_found',
    });
  });
});
