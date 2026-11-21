// A spreadsheet written as its file (docs/specs/029-sheets/files-and-print.md "Downloading"), from its sheets in tab
// order, every formula's value worked out by the engine and cached beside it. The api's download and an offline
// spreadsheet's (written in the browser) are the same file.
import { Workbook } from '../engine/workbook';
import type { Sheet } from '../sheet';
import { SheetLimits } from '../sheet-limits';
import type { WorkbookRecord } from '../workbook-record';
import { writeFlatOds, writeOds } from './ods-write';
import type { FileLoss } from './workbook-file';
import { workbookFileOf } from './workbook-file';

/** The formats a workbook is written in here: ODF as a package or flat. XLSX arrives with its mapping. */
export type WrittenWorkbookFormat = 'ods' | 'fods';

export type WrittenWorkbook = { data: Uint8Array<ArrayBuffer>; losses: FileLoss[] };

export function writeWorkbook(
  sheets: readonly Sheet[],
  record: WorkbookRecord,
  title: string,
  format: WrittenWorkbookFormat,
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
  const flat = writeFlatOds(file, title);
  return { data: new Uint8Array(new TextEncoder().encode(flat.data)), losses: flat.losses };
}
