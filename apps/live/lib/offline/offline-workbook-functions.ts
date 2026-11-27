// An offline spreadsheet's named functions saved whole in this browser (docs/specs/029-sheets/sheet-store.md "Offline
// documents"; formulas.md "Named functions"), as the api's functions door saves a stored one's: refused as it refuses.
import type { WorkbookSettingsResponse } from '@livedoc/api-schema';
import {
  NAMED_FUNCTIONS_MAX,
  readNamedFunctions,
  type NamedFunction,
  type WorkbookRecord,
} from '@livedoc/sheets';
import { ApiError } from '../api/core';
import { debugLog } from '../debug-log';
import { offlineGetRecord, offlineSaveWorkbook } from './offline-store';

export async function offlineSaveWorkbookFunctions(
  documentId: string,
  functions: readonly NamedFunction[],
): Promise<WorkbookSettingsResponse> {
  const rec = await offlineGetRecord(documentId);
  if (!rec?.workbook) throw new ApiError('save named functions', 404, 'workbook_not_found');
  if (functions.length > NAMED_FUNCTIONS_MAX)
    throw new ApiError('save named functions', 413, 'functions_full');
  const read = readNamedFunctions(functions);
  if (!read) throw new ApiError('save named functions', 400, 'functions_invalid');
  const { functions: _was, ...rest } = rec.workbook;
  const workbook: WorkbookRecord = { ...rest, ...(read.length > 0 ? { functions: read } : {}) };
  await offlineSaveWorkbook(documentId, workbook, Date.now());
  debugLog('[workbook] offline named functions saved', { count: read.length });
  return { workbook, rev: 0 };
}
