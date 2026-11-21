// An offline spreadsheet's conversion (docs/specs/029-sheets/files-and-print.md "Converting"; sheet-store.md "Offline
// documents"): its losses worked out and its format changed in this browser, as the api's conversion door does for a
// stored one. Loaded only for a conversion, as it carries the engine and the file writer.
import type { WorkbookConversionResponse, WorkbookSettingsResponse } from '@livedoc/api-schema';
import { sheetFromJson, WorkbookRecord, type WorkbookFormat } from '@livedoc/sheets';
import { workbookConversion } from '@livedoc/sheets/files';
import { ApiError } from '../api/core';
import { debugLog } from '../debug-log';
import { offlineFetchSheets } from './offline-sheets';
import { offlineGetRecord, offlineSaveWorkbook } from './offline-store';

async function workbookOf(documentId: string, action: string): Promise<WorkbookRecord> {
  const rec = await offlineGetRecord(documentId);
  if (!rec?.workbook) throw new ApiError(action, 404, 'workbook_not_found');
  return rec.workbook;
}

/** What a file in `to` cannot hold that the workbook's own could. */
export async function offlineWorkbookConversion(
  documentId: string,
  to: WorkbookFormat,
): Promise<WorkbookConversionResponse> {
  const workbook = await workbookOf(documentId, 'workbook conversion');
  const sheets = WorkbookRecord.sameStandard(to, workbook.format)
    ? []
    : (await offlineFetchSheets(documentId, null)).map(sheetFromJson);
  const listed = workbookConversion(sheets, workbook, to);
  debugLog('[workbook] offline conversion listed', {
    from: listed.from,
    to,
    losses: listed.losses.map((loss) => loss.k),
  });
  return listed;
}

/** The workbook converted to `format`, of the other standard; refused as the api refuses it. */
export async function offlineConvertWorkbook(
  documentId: string,
  format: WorkbookFormat,
): Promise<WorkbookSettingsResponse> {
  const workbook = await workbookOf(documentId, 'convert workbook');
  if (WorkbookRecord.sameStandard(format, workbook.format))
    throw new ApiError('convert workbook', 409, 'format_same_standard');
  const converted = WorkbookRecord.converted(workbook, format);
  await offlineSaveWorkbook(documentId, converted, Date.now());
  debugLog('[workbook] offline converted', { from: workbook.format, to: format });
  return { workbook: converted, rev: 0 };
}
