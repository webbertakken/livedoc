// An offline spreadsheet's file (docs/specs/029-sheets/files-and-print.md "Downloading", sheet-store.md "Offline
// documents"): written in this browser from the sheets its record holds, as the api writes a stored one, so a download
// never needs the server. Loaded only for that download, as it carries the engine and the file writer.
import { downloadFileName } from '@livedoc/office-packages';
import { sheetFromJson, type WorkbookFormat } from '@livedoc/sheets';
import { writeWorkbook } from '@livedoc/sheets/files';
import { ApiError } from '../api/core';
import { UNTITLED_SPREADSHEET } from '../spreadsheet/spreadsheet-name';
import { debugLog } from '../debug-log';
import { offlineFetchSheets } from './offline-sheets';
import { offlineGetRecord } from './offline-store';

export async function offlineWorkbookFile(
  documentId: string,
  format: WorkbookFormat,
): Promise<{ blob: Blob; fileName: string }> {
  const rec = await offlineGetRecord(documentId);
  if (!rec?.workbook) throw new ApiError('workbook file', 404, 'workbook_not_found');
  // Conversion is a person's choice (files-and-print.md "Converting"), and the XLSX mapping is still ahead.
  if (format === 'xlsx' || rec.workbook.format === 'xlsx')
    throw new ApiError('workbook file', 409, 'format_not_native');
  const sheets = (await offlineFetchSheets(documentId, null)).map(sheetFromJson);
  const written = writeWorkbook(sheets, rec.workbook, rec.name, format);
  debugLog('[workbook] offline file written', {
    format,
    sheets: sheets.length,
    bytes: written.data.byteLength,
    losses: written.losses.length,
  });
  return {
    blob: new Blob([written.data], { type: MEDIA_TYPES[format] }),
    fileName: downloadFileName(rec.name, format, UNTITLED_SPREADSHEET),
  };
}

const MEDIA_TYPES = {
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  fods: 'application/vnd.oasis.opendocument.spreadsheet-flat-xml',
} as const;
