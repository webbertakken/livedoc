// File › Open (docs/specs/029-sheets/spreadsheet.md "Making a spreadsheet"): an `.ods`, `.fods`, `.xlsx` or `.xlsm`
// from the computer becomes a new spreadsheet in the format its bytes are in (fork C1), named after the file. The file is read here, under the office packages'
// guards, into sheets the api's create stores as it stores any seed sheets; a named rejection is worded for the person.
import type { SheetCreateRequest } from '@livedoc/api-schema';
import { WorkbookRecord, type WorkbookFormat } from '@livedoc/sheets';
import { ApiError, apiCreateDocument } from '@/lib/api-client';
import { debugLog } from '@/lib/debug-log';
import { newSheetTab, workbookMadeHere } from './spreadsheet-document';
import { UNTITLED_SPREADSHEET } from './spreadsheet-name';

export type OpenedSpreadsheet =
  { ok: true; documentId: string; format: WorkbookFormat } | { ok: false; message: string };

// What each named rejection says (docs/specs/020-import-export/office-packages.md "Named rejections").
const REJECTION_COPY: Record<string, string> = {
  package_damaged: 'This file is damaged and could not be opened.',
  package_too_large: 'This file is too large to open.',
  package_encrypted:
    'This file is protected by a password. Remove the password, then open it again.',
  package_wrong_type: 'This file is not a spreadsheet LiveDoc can open yet.',
  xml_doctype_refused: 'This file holds content LiveDoc never opens.',
  xml_malformed: 'This file is damaged and could not be opened.',
};

const GENERIC = 'The file could not be opened. Try again.';
const NO_SHEETS = 'This file holds no sheets to open.';

/** The spreadsheet's name from the file's: its name without the extension. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || UNTITLED_SPREADSHEET;
}

export async function openSpreadsheetFile(ownerId: string, file: File): Promise<OpenedSpreadsheet> {
  const { readWorkbookFile, sheetsFromFile } = await import('@livedoc/sheets/files');
  const read = await readWorkbookFile(new Uint8Array(await file.arrayBuffer()));
  if (!read.ok) {
    debugLog('[workbook] refused', { rejection: read.rejection, entry: read.entry });
    return { ok: false, message: REJECTION_COPY[read.rejection] ?? GENERIC };
  }
  // A spreadsheet holds at least one sheet (spreadsheet.md "Sheets in the sheet bar").
  if (read.file.sheets.length === 0) return { ok: false, message: NO_SHEETS };
  const made = sheetsFromFile(read.file);
  const losses = [...read.losses, ...made.losses];
  if (losses.length > 0) debugLog('[workbook] file read losses', { kinds: losses.map((l) => l.k) });
  const documentId = crypto.randomUUID();
  const tabs = made.sheets.map((sheet) => newSheetTab(crypto.randomUUID(), sheet.title));
  const sheets: SheetCreateRequest[] = made.sheets.map((sheet, i) => ({
    id: sheet.id,
    tabId: tabs[i]!.id,
    title: sheet.title,
    layout: sheet.layout,
    cells: sheet.cells,
  }));
  try {
    await apiCreateDocument(ownerId, {
      id: documentId,
      name: nameFromFile(file.name),
      tabs,
      sheets,
      workbook: WorkbookRecord.withFormat(workbookMadeHere(), read.format),
    });
    debugLog('[workbook] file read', {
      format: read.format,
      sheets: sheets.length,
      cells: sheets.reduce((n, s) => n + (s.cells?.length ?? 0), 0),
    });
    return { ok: true, documentId, format: read.format };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : null;
    debugLog('[workbook] open refused', { code });
    return { ok: false, message: GENERIC };
  }
}
