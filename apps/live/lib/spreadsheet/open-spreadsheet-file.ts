// File › Open (docs/specs/029-sheets/spreadsheet.md "Making a spreadsheet"): an `.ods`, `.fods`, `.xlsx` or `.xlsm`
// from the computer becomes a new spreadsheet in the format its bytes are in (fork C1), named after the file. The file is read here, under the office packages'
// guards, into sheets the api's create stores as it stores any seed sheets; a named rejection is worded for the person.
import type { SheetCreateRequest } from '@livedoc/api-schema';
import { NOBODY, WorkbookRecord, type WorkbookFormat } from '@livedoc/sheets';
import type { PackageRejection } from '@livedoc/office-packages';
import type { FileParts } from '@livedoc/sheets/files';
import { ApiError, apiCreateDocument, apiDeleteDocument } from '@/lib/api-client';
import { writeSheet, type SheetsScope } from '@/lib/api/sheets';
import { debugLog } from '@/lib/debug-log';
import { newSheetTab, workbookMadeHere } from './spreadsheet-document';
import { UNTITLED_SPREADSHEET } from './spreadsheet-name';

export type OpenedSpreadsheet =
  { ok: true; documentId: string; format: WorkbookFormat } | { ok: false; message: string };

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
export type OpenProgress = (share: number) => void;

// The writes after the create, in order; any refusal stops them (files-and-print.md "A file sent in parts").
async function sendParts(
  scope: SheetsScope,
  parts: FileParts,
  onProgress: OpenProgress,
): Promise<void> {
  let sent = parts.seededUnits;
  onProgress(sent / parts.totalUnits);
  for (const part of parts.parts) {
    await writeSheet(scope, part.sheetId, { write: part.write, unchecked: true }, NOBODY);
    sent += part.units;
    onProgress(sent / parts.totalUnits);
  }
}

export async function openSpreadsheetFile(
  ownerId: string,
  file: File,
  onProgress: OpenProgress = () => {},
): Promise<OpenedSpreadsheet> {
  const { fileParts, readWorkbookFile, sheetsFromFile } = await import('@livedoc/sheets/files');
  // The workbook it opens into: its locale reads the formats a file leaves to the reader's (Excel's short date).
  const made = workbookMadeHere();
  const read = await readWorkbookFile(
    new Uint8Array(await file.arrayBuffer()),
    made.settings.locale,
  );
  if (!read.ok) {
    debugLog('[workbook] refused', { rejection: read.rejection, entry: read.entry });
    return { ok: false, message: REJECTION_COPY[read.rejection] };
  }
  // A spreadsheet holds at least one sheet (spreadsheet.md "Sheets in the sheet bar").
  if (read.file.sheets.length === 0) return { ok: false, message: NO_SHEETS };
  const sheetsMade = sheetsFromFile(read.file, made.settings.locale);
  const losses = [...read.losses, ...sheetsMade.losses];
  if (losses.length > 0) debugLog('[workbook] file read losses', { kinds: losses.map((l) => l.k) });
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
      name: nameFromFile(file.name),
      tabs,
      sheets,
      workbook: WorkbookRecord.opened(made, read.format),
    });
    created = true;
    const scope: SheetsScope = { ownerId, documentId, shareCode: null, tabId: null };
    await sendParts(scope, parts, onProgress);
    debugLog('[workbook] file read', {
      format: read.format,
      sheets: sheets.length,
      cells: sheetsMade.sheets.reduce((n, s) => n + s.cells.length, 0),
      parts: parts.parts.length,
    });
    return { ok: true, documentId, format: read.format };
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
