// A file opened as a new spreadsheet (docs/specs/029-sheets/files-and-print.md "Import", "A file sent in parts"):
// the editor's File › Open and the agents' `livedoc spreadsheet import` run this one flow (sheet-store.md "Built for
// agents in a spreadsheet", D274). An `.ods`, `.fods`, `.xlsx` or `.xlsm` becomes a spreadsheet in the format its bytes
// are in (fork C1); a `.csv`, `.tsv` or `.txt` one sheet of a new spreadsheet's format (D117). The file is read under
// the office packages' guards, the spreadsheet made with the sheets the first request carries, the rest sent in parts,
// then what the model does not hold kept; anything refused after the spreadsheet is made moves it to the Bin. Its
// pictures over the cells are stored in the opener's gallery first, so the sheets are made holding them (D628). The
// caller's port does the requests, so the browser and the CLI each send them their own way.
import { PACKAGE_MAX_BYTES, type PackageRejection } from '@livedoc/office-packages';
import type { SheetWrite } from '../store';
import { WorkbookRecord, type WorkbookFormat } from '../workbook-record';
import { textFileSplitOf, sheetsFromText } from './csv-file';
import { fileParts } from './file-parts';
import { picturesPlaced, type PictureStore } from './import-pictures';
import { importReport, type ReportedLoss } from './import-report';
import type { KeptContent, StoredAt } from './kept-content';
import { readWorkbookFile } from './read-workbook-file';
import { sheetsFromFile, type SheetFromFile, type SheetsFromFile } from './workbook-file';

/** The largest file that opens: the office package's budget (files-and-print.md "Import security"). */
export const SPREADSHEET_FILE_BYTES_MAX = PACKAGE_MAX_BYTES;

/** What was opened: a native format, or a CSV or TSV (files-and-print.md "Import"). */
export type ImportedFormat = WorkbookFormat | 'csv' | 'tsv';

/** Why a file did not become a spreadsheet: the package's named rejection, no sheets, or a request refused. */
export type FileOpenRejection = PackageRejection | 'no_sheets' | 'import_refused';

/** The spreadsheet the first request makes: its id, name, workbook row and the sheets it carries, each a tab. */
export type ImportedSpreadsheet = {
  documentId: string;
  name: string;
  record: WorkbookRecord;
  sheets: (SheetFromFile & { tabId: string })[];
};

/** The requests a file's opening sends; each throws when refused. */
export type SpreadsheetFilePort = {
  create(made: ImportedSpreadsheet): Promise<void>;
  // One part: rows, columns or cells of a sheet, stored as they are (never checked against validation rules).
  write(sheetId: string, write: SheetWrite): Promise<void>;
  // The file's kept content; answers how many of its items were past the sizes a spreadsheet stores.
  keep(kept: KeptContent<StoredAt>): Promise<number>;
  // Stores a picture the file holds in the opener's gallery: its image id, or why not (never throws).
  storePicture: PictureStore;
  // Moves a half-made spreadsheet to the Bin.
  bin(documentId: string): Promise<void>;
  log(event: string, data: Record<string, unknown>): void;
};

export type SpreadsheetFile = { fileName: string; name: string; bytes: Uint8Array<ArrayBuffer> };

export type FileOpened =
  | {
      ok: true;
      documentId: string;
      name: string;
      format: WorkbookFormat;
      imported: ImportedFormat;
      sheets: { id: string; tabId: string; title: string }[];
      cells: number;
      // What the file left behind, for the import report (files-and-print.md "The import report").
      report: ReportedLoss[];
    }
  | { ok: false; rejection: FileOpenRejection; cause?: unknown };

/** The spreadsheet's name from a file's: its name without the extension, or '' when nothing is left. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

/** How far a file is sent, from 0 to 1 (files-and-print.md "A file sent in parts"). */
export type FileProgress = (share: number) => void;

type Read = { record: WorkbookRecord; imported: ImportedFormat; made: SheetsFromFile };

// The file's sheets in the model, or why it is refused.
async function readFile(
  file: SpreadsheetFile,
  made: WorkbookRecord,
  port: SpreadsheetFilePort,
): Promise<Read | FileOpenRejection> {
  const split = textFileSplitOf(file.fileName);
  if (split) {
    // A CSV or TSV: one sheet, its values read as typed, in a new spreadsheet's format with Google's meaning (D117).
    const text = sheetsFromText(file.bytes, split, file.name, made.settings.locale);
    port.log('[workbook] text file read', { encoding: text.encoding, split });
    return { record: made, imported: split === 'tab' ? 'tsv' : 'csv', made: text };
  }
  const read = await readWorkbookFile(file.bytes, made.settings.locale);
  if (!read.ok) {
    port.log('[workbook] refused', { rejection: read.rejection, entry: read.entry });
    return read.rejection;
  }
  // A spreadsheet holds at least one sheet (spreadsheet.md "Sheets in the sheet bar").
  if (read.file.sheets.length === 0) return 'no_sheets';
  const fromFile = sheetsFromFile(read.file, made.settings.locale);
  fromFile.losses.unshift(...read.losses);
  return {
    record: WorkbookRecord.opened(made, read.format, read.file.theme, fromFile.functions),
    imported: read.format,
    made: fromFile,
  };
}

/**
 * Opens `file` as a new spreadsheet through `port`; `made` is the workbook row of one made by its opener (its locale
 * reads the formats a file leaves to the reader's). Nothing half-made is left behind.
 */
export async function importSpreadsheetFile(
  file: SpreadsheetFile,
  made: WorkbookRecord,
  port: SpreadsheetFilePort,
  onProgress: FileProgress = () => {},
): Promise<FileOpened> {
  // A file past the package's budget is refused before it is read (files-and-print.md "Import security").
  if (file.bytes.length > SPREADSHEET_FILE_BYTES_MAX) {
    port.log('[workbook] refused', { rejection: 'package_too_large', size: file.bytes.length });
    return { ok: false, rejection: 'package_too_large' };
  }
  const read = await readFile(file, made, port);
  if (typeof read === 'string') return { ok: false, rejection: read };
  const losses = read.made.losses;
  if (losses.length > 0) port.log('[workbook] file read losses', { kinds: losses.map((l) => l.k) });
  // Its pictures stored before the spreadsheet is made: one the gallery did not take is left out, named (D628).
  const pictures = read.made.pictures ?? [];
  const placed = await picturesPlaced(read.made.sheets, pictures, port.storePicture, losses);
  if (pictures.length > 0)
    port.log('[workbook] pictures stored', {
      read: pictures.length,
      placed: placed.placed,
      left: placed.left,
    });
  const parts = fileParts(placed.sheets);
  const documentId = crypto.randomUUID();
  const sheets = parts.seeds.map((sheet) => ({ ...sheet, tabId: crypto.randomUUID() }));
  let created = false;
  try {
    await port.create({ documentId, name: file.name, record: read.record, sheets });
    created = true;
    let sent = parts.seededUnits;
    onProgress(sent / parts.totalUnits);
    for (const part of parts.parts) {
      await port.write(part.sheetId, part.write);
      sent += part.units;
      onProgress(sent / parts.totalUnits);
    }
    // Then what the file holds that the model does not (standard-mapping.md "Unknown content"); a refusal bins it too.
    const left = read.made.kept ? await port.keep(read.made.kept) : 0;
    if (left > 0) losses.push({ k: 'kept_too_large', count: left });
  } catch (cause) {
    port.log('[workbook] open refused', { cause: String(cause), created });
    if (created)
      await port.bin(documentId).catch((e: unknown) => {
        port.log('[workbook] half-made spreadsheet not binned', { error: String(e) });
      });
    return { ok: false, rejection: 'import_refused', cause };
  }
  const report = importReport(losses);
  port.log('[workbook] import report', { kinds: report.map((line) => line.k) });
  const cells = read.made.sheets.reduce((n, s) => n + s.cells.length, 0);
  port.log('[workbook] file read', {
    format: read.imported,
    sheets: sheets.length,
    cells,
    parts: parts.parts.length,
  });
  return {
    ok: true,
    documentId,
    name: file.name,
    format: read.record.format,
    imported: read.imported,
    sheets: sheets.map(({ id, tabId, title }) => ({ id, tabId, title })),
    cells,
    report,
  };
}
