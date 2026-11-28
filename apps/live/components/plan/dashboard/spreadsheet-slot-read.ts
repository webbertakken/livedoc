// What a Spreadsheet slot shows (docs/specs/029-sheets/plan-links.md "The Spreadsheet slot", D507): its spreadsheet's
// first visible sheet, from two reads of the spreadsheet (linked-sheets): its sheets alone, which names the first, and
// that sheet. The first sheet is the sheets read's, so a reordered spreadsheet is followed at its next read. Pure.
import type { Sheet, Workbook } from '@livedoc/sheets';
import type { LinkedRead } from './linked-sheets';

export type SpreadsheetSlotRead =
  | { state: 'loading' }
  | { state: 'denied' }
  | { state: 'too-large' }
  | { state: 'failed' }
  // The spreadsheet holds no visible sheet.
  | { state: 'empty'; name: string }
  | {
      state: 'ready';
      // The spreadsheet's name, and its first sheet's id and name.
      name: string;
      sheetId: string;
      title: string;
      sheet: Sheet;
      wb: Workbook;
      // Counts up with each new read, so the picture is drawn again.
      version: number;
    };

const LOADING: SpreadsheetSlotRead = { state: 'loading' };

/** The first visible sheet's id once the sheets read has answered, else ''. */
export function firstSheetIdOf(sheets: LinkedRead): string {
  return sheets.state === 'ready' ? (sheets.sheets[0]?.id ?? '') : '';
}

/** The slot's read from its sheets read and its first sheet's read. */
export function spreadsheetSlotRead(sheets: LinkedRead, first: LinkedRead): SpreadsheetSlotRead {
  if (sheets.state !== 'ready')
    return sheets.state === 'loading' ? LOADING : { state: sheets.state };
  const shown = sheets.sheets[0];
  if (!shown) return { state: 'empty', name: sheets.name };
  if (first.state !== 'ready') return first.state === 'loading' ? LOADING : { state: first.state };
  // Deleted since the sheets were read: the next sheets read names the new first.
  if (!first.sheet || first.sheet.id !== shown.id) return LOADING;
  return {
    state: 'ready',
    name: first.name,
    sheetId: shown.id,
    title: first.sheets.find((s) => s.id === shown.id)?.title ?? shown.title,
    sheet: first.sheet,
    wb: first.wb,
    version: first.version,
  };
}
