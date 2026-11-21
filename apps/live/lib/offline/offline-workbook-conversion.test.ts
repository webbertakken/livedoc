// docs/specs/029-sheets/files-and-print.md "Converting"; sheet-store.md "Offline documents": a spreadsheet in This
// Browser lists its losses and converts in this browser, refused as the api refuses.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyLayout, WorkbookRecord, type SheetJson } from '@livedoc/sheets';
import { __setOfflineBackend, offlineGetRecord, offlinePutRecord } from './offline-store';
import { memBackend, testRecord } from './offline-test-utils';
import { offlineConvertWorkbook, offlineWorkbookConversion } from './offline-workbook-conversion';

let n = 5;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const layout = emptyLayout(rand, 2, 2);
const ME = { id: 'me', name: 'Me', color: '#000000' };
const workbook = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const sheet: SheetJson = {
  id: 'sheetOne1',
  tabId: 't1',
  title: 'Sheet1',
  layout,
  cells: [{ r: layout.rows[0]!, c: layout.cols[0]!, i: { f: { t: 'EASTERSUNDAY(2024)', r: [] } } }],
  rev: 1,
  createdAt: 1,
  updatedAt: 1,
  updatedBy: ME,
};

beforeEach(() => __setOfflineBackend(memBackend()));
afterEach(() => __setOfflineBackend(null));

describe('offlineWorkbookConversion', () => {
  it('lists what the other format cannot hold, from the sheets in this browser', async () => {
    await offlinePutRecord(testRecord({ workbook, sheets: [sheet] }));
    expect(await offlineWorkbookConversion('d1', 'xlsx')).toEqual({
      from: 'ods',
      to: 'xlsx',
      losses: [{ k: 'formula_uncalculated', count: 1, functions: ['EASTERSUNDAY'] }],
    });
    expect((await offlineWorkbookConversion('d1', 'fods')).losses).toEqual([]);
  });

  // formulas.md, the file's meaning (D97): a file's meaning becomes the new format's; Google's stays.
  it('gives a file’s meaning the new format’s', async () => {
    const opened = WorkbookRecord.opened(workbook, 'ods');
    await offlinePutRecord(testRecord({ workbook: opened, sheets: [sheet] }));
    expect((await offlineConvertWorkbook('d1', 'xlsx')).workbook.meaning).toBe('ooxml');
    expect((await offlineGetRecord('d1'))?.workbook?.meaning).toBe('ooxml');
  });

  it('refuses a document that is no spreadsheet', async () => {
    await offlinePutRecord(testRecord());
    await expect(offlineWorkbookConversion('d1', 'xlsx')).rejects.toMatchObject({
      code: 'workbook_not_found',
    });
  });
});

describe('offlineConvertWorkbook', () => {
  it('changes the format kept in this browser, and refuses the standard it is in', async () => {
    await offlinePutRecord(testRecord({ workbook, sheets: [sheet] }));
    const converted = await offlineConvertWorkbook('d1', 'xlsx');
    expect(converted.workbook.format).toBe('xlsx');
    expect((await offlineGetRecord('d1'))?.workbook?.format).toBe('xlsx');
    await expect(offlineConvertWorkbook('d1', 'xlsx')).rejects.toMatchObject({
      code: 'format_same_standard',
    });
  });

  it('refuses a document that is no spreadsheet', async () => {
    await offlinePutRecord(testRecord());
    await expect(offlineConvertWorkbook('d1', 'ods')).rejects.toMatchObject({
      code: 'workbook_not_found',
    });
  });
});
