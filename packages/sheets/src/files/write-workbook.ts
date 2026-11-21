// A spreadsheet written as its file (docs/specs/029-sheets/files-and-print.md "Downloading"), from its sheets in tab
// order, every formula's value worked out by the engine and cached beside it. The api's download and an offline
// spreadsheet's (written in the browser) are the same file.
import { Workbook } from '../engine/workbook';
import type { Sheet } from '../sheet';
import { SheetLimits } from '../sheet-limits';
import type { WorkbookFormat, WorkbookRecord } from '../workbook-record';
import { writeFlatOds, writeOds } from './ods-write';
import type { FileLoss } from './workbook-file';
import { workbookFileOf } from './workbook-file';
import { writeXlsx } from './xlsx-write';

export type WrittenWorkbook = { data: Uint8Array<ArrayBuffer>; losses: FileLoss[] };

export function writeWorkbook(
  sheets: readonly Sheet[],
  record: WorkbookRecord,
  title: string,
  format: WorkbookFormat,
): WrittenWorkbook {
  const engine = new Workbook({
    sheets: [...sheets],
    locale: record.settings.locale,
    timeZone: record.settings.timeZone,
    limits: SheetLimits.spreadsheet,
    iteration: record.settings.iterate,
  });
  const file = workbookFileOf(engine, sheets);
  if (format === 'ods') return writeOds(file, title);
  if (format === 'xlsx') return writeXlsx(file, title);
  const flat = writeFlatOds(file, title);
  return { data: new Uint8Array(new TextEncoder().encode(flat.data)), losses: flat.losses };
}
