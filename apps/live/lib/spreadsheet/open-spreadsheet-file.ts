// File › Open (docs/specs/029-sheets/spreadsheet.md "Making a spreadsheet"): an `.ods`, `.fods`, `.xlsx` or `.xlsm`
// from the computer becomes a new spreadsheet in the format its bytes are in (fork C1), named after the file; a `.csv`,
// `.tsv` or `.txt` one sheet of it in a new spreadsheet's format (files-and-print.md "Import", D117). The file is read
// here, under the office packages' guards, into sheets the api's create stores as it stores any seed sheets; a named
// rejection is worded for the person.
import type { SheetCreateRequest } from '@livedoc/api-schema';
import { WorkbookRecord, type WorkbookFormat } from '@livedoc/sheets';
import { PACKAGE_MAX_BYTES, type PackageRejection } from '@livedoc/office-packages';
import type { SheetsFromFile } from '@livedoc/sheets/files';
import { ApiError, apiCreateDocument, apiDeleteDocument } from '@/lib/api-client';
import type { SheetsScope } from '@/lib/api/sheets';
import { sendKept } from '@/lib/api/workbook-kept';
import { debugLog } from '@/lib/debug-log';
import { importReportLine } from './import-report-copy';
import { keepImportReport } from './import-report-handoff';
import { newSheetTab, workbookMadeHere } from './spreadsheet-document';
import { sendFileParts, type PartsProgress } from './send-file-parts';
import { UNTITLED_SPREADSHEET } from './spreadsheet-name';

/** What was opened: a native format, or a CSV or TSV (files-and-print.md "Import"). */
export type ImportedFormat = WorkbookFormat | 'csv' | 'tsv';

export type OpenedSpreadsheet =
  | { ok: true; documentId: string; format: WorkbookFormat; imported: ImportedFormat }
  | { ok: false; message: string };

// What each named rejection says (docs/specs/020-import-export/office-packages.md "Named rejections").
const REJECTION_COPY: Record<PackageRejection, string> = {
  package_damaged: 'This file is damaged and could not be opened.',
  package_too_large: 'This file is too large to open.',
  picture_too_large: 'This file holds a picture too large to open.',
  document_too_large: 'This file is too large to open.',
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

/** What the title row says while a file is sent (files-and-print.md "A file sent in parts"). */
export function openingNotice(name: string, share: number): string {
  return `Opening “${name}”… ${Math.floor(Math.min(1, Math.max(0, share)) * 100)}%`;
}

/** How far a file is sent, from 0 to 1 (files-and-print.md "A file sent in parts"). */
export type OpenProgress = PartsProgress;

export async function openSpreadsheetFile(
  ownerId: string,
  file: File,
  onProgress: OpenProgress = () => {},
): Promise<OpenedSpreadsheet> {
  // A file past the package's budget is refused before its bytes are read (files-and-print.md "Import security").
  if (file.size > PACKAGE_MAX_BYTES) {
    debugLog('[workbook] refused', { rejection: 'package_too_large', size: file.size });
    return { ok: false, message: REJECTION_COPY.package_too_large };
  }
  const files = await import('@livedoc/sheets/files');
  // The workbook it opens into: its locale reads the formats a file leaves to the reader's (Excel's short date).
  const made = workbookMadeHere();
  const name = nameFromFile(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const split = files.textFileSplitOf(file.name);
  let opened: { record: WorkbookRecord; imported: ImportedFormat; sheetsMade: SheetsFromFile };
  if (split) {
    // A CSV or TSV: one sheet, its values read as typed, in a new spreadsheet's format with Google's meaning (D117).
    const sheetsMade = files.sheetsFromText(bytes, split, name, made.settings.locale);
    debugLog('[workbook] text file read', { encoding: sheetsMade.encoding, split });
    opened = { record: made, imported: split === 'tab' ? 'tsv' : 'csv', sheetsMade };
  } else {
    const read = await files.readWorkbookFile(bytes, made.settings.locale);
    if (!read.ok) {
      debugLog('[workbook] refused', { rejection: read.rejection, entry: read.entry });
      return { ok: false, message: REJECTION_COPY[read.rejection] };
    }
    // A spreadsheet holds at least one sheet (spreadsheet.md "Sheets in the sheet bar").
    if (read.file.sheets.length === 0) return { ok: false, message: NO_SHEETS };
    const sheetsMade = files.sheetsFromFile(read.file, made.settings.locale);
    sheetsMade.losses.unshift(...read.losses);
    opened = {
      record: WorkbookRecord.opened(made, read.format),
      imported: read.format,
      sheetsMade,
    };
  }
  const { sheetsMade } = opened;
  const losses = sheetsMade.losses;
  if (losses.length > 0) debugLog('[workbook] file read losses', { kinds: losses.map((l) => l.k) });
  const fileParts = files.fileParts;
  const parts = fileParts(sheetsMade.sheets);
  const documentId = crypto.randomUUID();
  const tabs = parts.seeds.map((sheet) => newSheetTab(crypto.randomUUID(), sheet.title));
  const sheets: SheetCreateRequest[] = parts.seeds.map((sheet, i) => ({
    id: sheet.id,
    tabId: tabs[i]!.id,
    title: sheet.title,
    layout: sheet.layout,
    cells: sheet.cells,
  }));
  let created = false;
  try {
    await apiCreateDocument(ownerId, {
      id: documentId,
      name,
      tabs,
      sheets,
      workbook: opened.record,
    });
    created = true;
    const scope: SheetsScope = { ownerId, documentId, shareCode: null, tabId: null };
    await sendFileParts(scope, parts, onProgress);
    // Then what the file holds that the model does not (standard-mapping.md "Unknown content"); a refusal bins it too.
    const left = sheetsMade.kept ? await sendKept(scope, sheetsMade.kept) : 0;
    if (left > 0) losses.push({ k: 'kept_too_large', count: left });
    // What the file left behind, shown once on the spreadsheet it made (files-and-print.md "The import report").
    const report = files.importReport(losses);
    debugLog('[workbook] import report', { kinds: report.map((line) => line.k) });
    if (report.length > 0)
      keepImportReport(documentId, { name, lines: report.map(importReportLine) });
    debugLog('[workbook] file read', {
      format: opened.imported,
      sheets: sheets.length,
      cells: sheetsMade.sheets.reduce((n, s) => n + s.cells.length, 0),
      parts: parts.parts.length,
    });
    return { ok: true, documentId, format: opened.record.format, imported: opened.imported };
  } catch (error) {
    const code = error instanceof ApiError ? error.code : null;
    debugLog('[workbook] open refused', { code, created });
    // Nothing half-made is left: a spreadsheet made before a part was refused goes to the Bin.
    if (created)
      await apiDeleteDocument(ownerId, documentId).catch((e: unknown) => {
        debugLog('[workbook] half-made spreadsheet not binned', { error: String(e) });
      });
    return { ok: false, message: GENERIC };
  }
}
