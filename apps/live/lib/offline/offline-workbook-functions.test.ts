// formulas.md "Named functions"; sheet-store.md "Offline documents": a spreadsheet in This Browser saves its named
// functions in this browser, refused as the api refuses.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NAMED_FUNCTIONS_MAX, WorkbookRecord } from '@livedoc/sheets';
import { __setOfflineBackend, offlineGetRecord, offlinePutRecord } from './offline-store';
import { memBackend, testRecord } from './offline-test-utils';
import { offlineSaveWorkbookFunctions } from './offline-workbook-functions';

const workbook = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
const TWICE = { name: 'TWICE', params: ['x'], body: '=x*2' };

beforeEach(() => __setOfflineBackend(memBackend()));
afterEach(() => __setOfflineBackend(null));

describe('offlineSaveWorkbookFunctions', () => {
  it('saves them whole, none as none', async () => {
    await offlinePutRecord(testRecord({ workbook, sheets: [] }));
    expect(await offlineSaveWorkbookFunctions('d1', [TWICE])).toEqual({
      workbook: { ...workbook, functions: [TWICE] },
      rev: 0,
    });
    expect((await offlineGetRecord('d1'))!.workbook!.functions).toEqual([TWICE]);
    expect((await offlineSaveWorkbookFunctions('d1', [])).workbook).toEqual(workbook);
    expect((await offlineGetRecord('d1'))!.workbook).toEqual(workbook);
  });

  it('refuses what the api refuses', async () => {
    await offlinePutRecord(testRecord({ workbook, sheets: [] }));
    await expect(
      offlineSaveWorkbookFunctions('d1', [{ ...TWICE, body: '=A1' }]),
    ).rejects.toMatchObject({ status: 400 });
    const many = Array.from({ length: NAMED_FUNCTIONS_MAX + 1 }, (_, i) => ({
      ...TWICE,
      name: `F_${i}`,
    }));
    await expect(offlineSaveWorkbookFunctions('d1', many)).rejects.toMatchObject({
      status: 413,
    });
    await expect(offlineSaveWorkbookFunctions('nope', [TWICE])).rejects.toMatchObject({
      status: 404,
    });
  });
});
