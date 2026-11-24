// A sheet's rows, columns and cells past the first request, sent as writes in order (docs/specs/029-sheets/
// files-and-print.md "A file sent in parts"): a file opened, or a sheet copied to another spreadsheet (Copy To). Any
// refusal stops them; the caller undoes what was half made.
import { NOBODY } from '@livedoc/sheets';
import type { FileParts } from '@livedoc/sheets/files';
import { writeSheet, type SheetsScope } from '@/lib/api/sheets';

/** How far the parts are sent, from 0 to 1. */
export type PartsProgress = (share: number) => void;

export async function sendFileParts(
  scope: SheetsScope,
  parts: FileParts,
  onProgress: PartsProgress,
): Promise<void> {
  let sent = parts.seededUnits;
  onProgress(sent / parts.totalUnits);
  for (const part of parts.parts) {
    await writeSheet(scope, part.sheetId, { write: part.write, unchecked: true }, NOBODY);
    sent += part.units;
    onProgress(sent / parts.totalUnits);
  }
}
