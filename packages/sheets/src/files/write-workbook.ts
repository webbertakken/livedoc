// A spreadsheet written as its file (docs/specs/029-sheets/files-and-print.md "Downloading"), from its sheets in tab
// order, every formula's value worked out by the engine and cached beside it. The api's download and an offline
// spreadsheet's (written in the browser) are the same file.
import { Workbook } from '../engine/workbook';
import type { Sheet } from '../sheet';
import { SheetLimits } from '../sheet-limits';
import { formulasAnsweringDifferently, type FormulaMeaning } from '../formula/meaning';
import { WorkbookRecord, type WorkbookFormat } from '../workbook-record';
import { writeFlatOds, writeOds } from './ods-write';
import type { FileLoss, WorkbookFile } from './workbook-file';
import { workbookFileOf } from './workbook-file';
import { writeXlsx } from './xlsx-write';

export type WrittenWorkbook = { data: Uint8Array<ArrayBuffer>; losses: FileLoss[] };

/** The workbook as a file holds it, every value worked out by the engine with the workbook's settings. */
export function workbookFileFor(sheets: readonly Sheet[], record: WorkbookRecord): WorkbookFile {
  const engine = new Workbook({
    sheets: [...sheets],
    locale: record.settings.locale,
    timeZone: record.settings.timeZone,
    ...(record.meaning ? { meaning: record.meaning } : {}),
    limits: SheetLimits.spreadsheet,
    iteration: record.settings.iterate,
  });
  return workbookFileOf(engine, sheets, record.settings.locale);
}

/** The formulas of a file. */
function* formulasOf(file: WorkbookFile): Generator<string> {
  for (const sheet of file.sheets)
    for (const cell of sheet.cells) if (cell.formula !== undefined) yield cell.formula;
}

/** The file's formulas that may answer differently read in a format's meaning than in the spreadsheet's (D100). */
export function answersDiffering(
  file: WorkbookFile,
  meaning: FormulaMeaning,
  format: WorkbookFormat,
): { count: number; functions: string[] } {
  return formulasAnsweringDifferently(formulasOf(file), meaning, WorkbookRecord.meaningOf(format));
}

function written(file: WorkbookFile, title: string, format: WorkbookFormat): WrittenWorkbook {
  if (format === 'ods') return writeOds(file, title);
  if (format === 'xlsx') return writeXlsx(file, title);
  const flat = writeFlatOds(file, title);
  return { data: new Uint8Array(new TextEncoder().encode(flat.data)), losses: flat.losses };
}

/** The workbook as a format's file, with what it loses, the formulas its standard answers differently among them. */
export function writeWorkbook(
  sheets: readonly Sheet[],
  record: WorkbookRecord,
  title: string,
  format: WorkbookFormat,
): WrittenWorkbook {
  const file = workbookFileFor(sheets, record);
  const out = written(file, title, format);
  const differ = answersDiffering(file, record.meaning ?? 'google', format);
  if (differ.count === 0) return out;
  return { data: out.data, losses: [...out.losses, { k: 'answers_differ', ...differ }] };
}
