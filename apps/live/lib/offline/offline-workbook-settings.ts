// An offline spreadsheet's settings saved whole in this browser (docs/specs/029-sheets/sheet-store.md "Offline
// documents"; formatting.md "Themes"), as the api's settings door saves a stored one's: refused as it refuses them.
import type { WorkbookSettingsResponse } from '@livedoc/api-schema';
import { WorkbookRecord, type WorkbookSettings } from '@livedoc/sheets';
import { ApiError } from '../api/core';
import { debugLog } from '../debug-log';
import { offlineGetRecord, offlineSaveWorkbook } from './offline-store';

export async function offlineSaveWorkbookSettings(
  documentId: string,
  settings: WorkbookSettings,
): Promise<WorkbookSettingsResponse> {
  const rec = await offlineGetRecord(documentId);
  if (!rec?.workbook) throw new ApiError('save workbook settings', 404, 'workbook_not_found');
  const read = WorkbookRecord.readSettings(settings);
  if (!read) throw new ApiError('save workbook settings', 400, 'settings_invalid');
  const workbook: WorkbookRecord = { ...rec.workbook, settings: read };
  await offlineSaveWorkbook(documentId, workbook, Date.now());
  debugLog('[workbook] offline settings saved', { theme: read.theme?.id ?? 'standard' });
  return { workbook, rev: 0 };
}
