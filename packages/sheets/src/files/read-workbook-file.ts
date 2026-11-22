// Any spreadsheet file read into the file model (docs/specs/029-sheets/files-and-print.md "Import"): the format found
// from the bytes, never the file's name (office-packages.md "Reading a package" step 4), so the workbook keeps the
// format the file is in (fork C1).
import { PACKAGE_BUDGETS, packageKind, type PackageBudgets } from '@livedoc/office-packages';
import type { WorkbookFormat } from '../workbook-record';
import { readOds } from './ods-read';
import type { FileRead } from './workbook-file';
import { readXlsx } from './xlsx-read';

export type WorkbookFileRead =
  (FileRead & { ok: true; format: WorkbookFormat }) | Exclude<FileRead, { ok: true }>;

/**
 * A `.ods`, `.fods`, `.xlsx` or `.xlsm` file's sheets with the format it is in, or the package's named rejection;
 * `locale` the workbook's it opens into, for the formats a file leaves to the reader's locale; `budgets` the
 * package's, smaller in tests.
 */
export async function readWorkbookFile(
  bytes: Uint8Array<ArrayBuffer>,
  locale?: string,
  budgets: PackageBudgets = PACKAGE_BUDGETS,
): Promise<WorkbookFileRead> {
  const kind = packageKind(bytes);
  const read =
    kind === 'ooxml' ? await readXlsx(bytes, locale, budgets) : await readOds(bytes, budgets);
  if (!read.ok) return read;
  const format: WorkbookFormat = kind === 'ooxml' ? 'xlsx' : kind === 'flat' ? 'fods' : 'ods';
  return { ...read, format };
}
