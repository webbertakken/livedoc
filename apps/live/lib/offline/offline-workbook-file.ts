// An offline spreadsheet's file (docs/specs/029-sheets/files-and-print.md "Downloading", sheet-store.md "Offline
// documents"): written in this browser from the sheets its record holds, as the api writes a stored one, so a download
// never needs the server; in the other standard, a converted copy (files-and-print.md "Download"). Loaded only for that
// download, as it carries the engine and the file writer.
import { downloadFileName } from '@livedoc/office-packages';
import { sheetFromJson } from '@livedoc/sheets';
import { writeSheetText, writeWorkbook } from '@livedoc/sheets/files';
import type { DownloadFormat } from '../api/workbook';
import { ApiError } from '../api/core';
import { UNTITLED_SPREADSHEET } from '../spreadsheet/spreadsheet-name';
import { debugLog } from '../debug-log';
import { offlineFetchSheets } from './offline-sheets';
import { offlineGetRecord } from './offline-store';

export async function offlineWorkbookFile(
  documentId: string,
  format: DownloadFormat,
  tabId = '',
): Promise<{ blob: Blob; fileName: string }> {
  const rec = await offlineGetRecord(documentId);
  if (!rec?.workbook) throw new ApiError('workbook file', 404, 'workbook_not_found');
  const sheets = (await offlineFetchSheets(documentId, null)).map(sheetFromJson);
  // The open sheet as CSV or TSV, as the api writes it (files-and-print.md "Download", D118).
  if (format === 'csv' || format === 'tsv') {
    const text = writeSheetText(sheets, rec.workbook, tabId, format === 'csv' ? ',' : '\t');
    if (!text) throw new ApiError('workbook file', 404, 'sheet_not_found');
    debugLog('[workbook] offline sheet file written', { format, chars: text.text.length });
    return {
      blob: new Blob([text.text], { type: TEXT_MEDIA_TYPES[format] }),
      fileName: downloadFileName(
        `${rec.name || UNTITLED_SPREADSHEET} - ${text.title}`,
        format,
        UNTITLED_SPREADSHEET,
      ),
    };
  }
  // Its kept content goes into files of its standard only (standard-mapping.md "Unknown content", D109).
  const written = writeWorkbook(sheets, rec.workbook, rec.name, format, rec.kept);
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
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

const TEXT_MEDIA_TYPES = {
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
} as const;
