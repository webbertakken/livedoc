// File › Open (docs/specs/029-sheets/spreadsheet.md "Making a spreadsheet"): a file from the computer becomes a new
// spreadsheet through the flow the agents' `livedoc spreadsheet import` shares (`importSpreadsheetFile`,
// files-and-print.md "Import", D274); here are the browser's requests, its words for a refusal, and the import report
// handed to the spreadsheet it made.
import { NOBODY, type WorkbookFormat } from '@livedoc/sheets';
import {
  fileOpenRefusalWords,
  importReportLine,
  importSpreadsheetFile,
  nameFromFile,
  SPREADSHEET_FILE_BYTES_MAX,
  threadBatches,
  type ImportedFormat,
  type SpreadsheetFilePort,
} from '@livedoc/sheets/files';
import { apiCreateDocument, apiDeleteDocument } from '@/lib/api-client';
import { writeSheet, type SheetsScope } from '@/lib/api/sheets';
import { sendKept } from '@/lib/api/workbook-kept';
import { postSheetThreadsFromFile } from '@/lib/api/sheet-threads';
import { debugLog } from '@/lib/debug-log';
import { keepImportReport } from '@/lib/office/import-report-handoff';
import { newSheetTab, workbookMadeHere } from './spreadsheet-document';
import { spreadsheetPictureStore } from './spreadsheet-picture-store';
import { UNTITLED_SPREADSHEET } from './spreadsheet-name';

export type OpenedSpreadsheet =
  | { ok: true; documentId: string; format: WorkbookFormat; imported: ImportedFormat }
  | { ok: false; message: string };

/** The spreadsheet's name from the file's: its name without the extension, else an untitled one's. */
export function spreadsheetNameFor(fileName: string): string {
  return nameFromFile(fileName) || UNTITLED_SPREADSHEET;
}

/** What the title row says while a file is sent (files-and-print.md "A file sent in parts"). */
export function openingNotice(name: string, share: number): string {
  return `Opening “${name}”… ${Math.floor(Math.min(1, Math.max(0, share)) * 100)}%`;
}

/** How far a file is sent, from 0 to 1 (files-and-print.md "A file sent in parts"). */
export type OpenProgress = (share: number) => void;

// The browser's requests for the shared flow: the parts stored unchecked, as an import's are.
function browserPort(ownerId: string): SpreadsheetFilePort {
  const scopeOf = (documentId: string): SheetsScope => ({
    ownerId,
    documentId,
    shareCode: null,
    tabId: null,
  });
  let scope: SheetsScope | null = null;
  return {
    create: async ({ documentId, name, record, sheets }) => {
      scope = scopeOf(documentId);
      await apiCreateDocument(ownerId, {
        id: documentId,
        name,
        tabs: sheets.map((sheet) => newSheetTab(sheet.tabId, sheet.title)),
        sheets: sheets.map(({ id, tabId, title, layout, cells }) => ({
          id,
          tabId,
          title,
          layout,
          cells,
        })),
        workbook: record,
      });
    },
    write: async (sheetId, write) => {
      await writeSheet(scope!, sheetId, { write, unchecked: true }, NOBODY);
    },
    keep: (kept) => sendKept(scope!, kept),
    // An opened file's comment threads, in parts (standard-mapping.md "Comments in the file").
    threads: async (sheetId, threads) => {
      for (const batch of threadBatches(threads))
        await postSheetThreadsFromFile(scope!, sheetId, batch);
    },
    bin: (documentId) => apiDeleteDocument(ownerId, documentId),
    // Into the opener's gallery through the import image pipeline, loaded with the first picture (D628).
    storePicture: spreadsheetPictureStore(async () =>
      (await import('@/lib/import-images/browser')).createBrowserImportImageSession({
        ownerId,
        documentId: null,
        offline: false,
      }),
    ),
    log: debugLog,
  };
}

export async function openSpreadsheetFile(
  ownerId: string,
  file: File,
  onProgress: OpenProgress = () => {},
): Promise<OpenedSpreadsheet> {
  // A file past the package's budget is refused before its bytes are read (files-and-print.md "Import security").
  if (file.size > SPREADSHEET_FILE_BYTES_MAX) {
    debugLog('[workbook] refused', { rejection: 'package_too_large', size: file.size });
    return { ok: false, message: fileOpenRefusalWords('package_too_large') };
  }
  const name = spreadsheetNameFor(file.name);
  const opened = await importSpreadsheetFile(
    { fileName: file.name, name, bytes: new Uint8Array(await file.arrayBuffer()) },
    // Its locale reads the formats a file leaves to the reader's (Excel's short date).
    workbookMadeHere(),
    browserPort(ownerId),
    onProgress,
  );
  if (!opened.ok) return { ok: false, message: fileOpenRefusalWords(opened.rejection) };
  // What the file left behind, shown once on the spreadsheet it made (files-and-print.md "The import report").
  if (opened.report.length > 0)
    keepImportReport(opened.documentId, { name, lines: opened.report.map(importReportLine) });
  return {
    ok: true,
    documentId: opened.documentId,
    format: opened.format,
    imported: opened.imported,
  };
}
