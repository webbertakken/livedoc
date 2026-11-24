// What a refused sheet write or sheet change says (docs/specs/029-sheets/sheet-store.md, spreadsheet.md "Limits"):
// a Plan Sheet's words, and a spreadsheet's own where its limits differ.
import { formatA1, layoutIndex, splitCellKey, type SheetLayout } from '@livedoc/sheets';

const REFUSALS: Partial<Record<string, string>> = {
  sheet_full: 'This sheet holds the most cells it can',
  sheets_full: 'This document holds the most sheets it can',
  sheet_too_large: 'A sheet holds up to 10,000 rows and 200 columns',
  sheet_title_taken: 'Another sheet on this tab is called that',
  sheet_name_taken: 'Another sheet in this spreadsheet is called that',
  sheet_name_invalid: "A sheet's name can't hold [ ] * ? / \\ : or start or end with '",
  input_too_long: 'A cell holds up to 10,000 characters',
  sheet_not_found: 'This sheet is no longer in this document',
  rules_full: 'This sheet holds the most rules it can',
  sheet_loading: 'This sheet is still loading',
};

// A spreadsheet's own words where its limits differ (spreadsheet.md "Limits").
const SPREADSHEET_REFUSALS: Partial<Record<string, string>> = {
  sheet_too_large: 'A sheet holds up to 18,278 columns (A to ZZZ)',
  input_too_long: 'A cell holds up to 50,000 characters',
  workbook_full: 'This spreadsheet holds up to 1,000,000 rows and 20,000,000 cells',
  sheets_full: 'A spreadsheet holds up to 200 sheets',
  sheet_last_visible: 'A spreadsheet keeps at least one sheet',
  sheet_exists: 'That sheet is already back in this spreadsheet',
};

// What a refused write says: a value a validation rule refuses names its cell and what the rule allows.
export function writeRefusalMessage(
  check: { error: string; at?: string; line?: string },
  layout?: SheetLayout,
  spreadsheet = false,
): string {
  if (check.error === 'value_invalid' && check.line) {
    const ix = layout && check.at ? layoutIndex(layout) : null;
    const { r, c } = check.at ? splitCellKey(check.at) : { r: '', c: '' };
    const row = ix?.rowPos.get(r);
    const col = ix?.colPos.get(c);
    return row !== undefined && col !== undefined
      ? `${formatA1(row, col)}: ${check.line}`
      : check.line;
  }
  return sheetRefusalMessage(check.error, spreadsheet);
}

export function sheetRefusalMessage(code: string | null, spreadsheet = false): string {
  return (
    (code && ((spreadsheet ? SPREADSHEET_REFUSALS[code] : undefined) ?? REFUSALS[code])) ??
    "Couldn't save that change"
  );
}
