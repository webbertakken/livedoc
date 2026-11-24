// formatting.md "Themes"; sheet-store.md "Offline documents": a spreadsheet in This Browser saves its settings (its
// theme) in this browser, refused as the api refuses.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SPREADSHEET_THEMES, WorkbookRecord } from '@livedoc/sheets';
import { __setOfflineBackend, offlineGetRecord, offlinePutRecord } from './offline-store';
import { memBackend, testRecord } from './offline-test-utils';
import { offlineSaveWorkbookSettings } from './offline-workbook-settings';

const workbook = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

beforeEach(() => __setOfflineBackend(memBackend()));
afterEach(() => __setOfflineBackend(null));

describe('offlineSaveWorkbookSettings', () => {
  it('saves the settings whole, and refuses ones that are not, or a document with no workbook', async () => {
    await offlinePutRecord(testRecord({ workbook, sheets: [] }));
    const settings = { ...workbook.settings, theme: SPREADSHEET_THEMES[3]! };
    expect(await offlineSaveWorkbookSettings('d1', settings)).toEqual({
      workbook: { ...workbook, settings },
      rev: 0,
    });
    expect((await offlineGetRecord('d1'))!.workbook!.settings.theme!.id).toBe('forest');
    await expect(
      offlineSaveWorkbookSettings('d1', { ...settings, recalc: 'x' as never }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(offlineSaveWorkbookSettings('nope', settings)).rejects.toMatchObject({
      status: 404,
    });
  });
});
