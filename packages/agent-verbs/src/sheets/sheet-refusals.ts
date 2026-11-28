// The sheet store's refusals in words (docs/specs/029-sheets/sheet-store.md "Limits"; docs/specs/026-plan/plan-agents.md
// "Errors that teach"): one line per code the api names, read by apiRefusalOf for the CLI and the MCP alike.
import type { SheetError } from '@livedoc/api-schema';

export const SHEET_REFUSAL_WORDS: Readonly<Record<SheetError, string>> = {
  sheet_not_found: 'no such sheet (it may have been deleted). list_sheets lists them.',
  sheet_exists: 'a sheet with that id is already there.',
  sheet_busy: 'the sheet is busy with other writes: try again.',
  sheet_title_taken: 'another sheet on that tab has that title: pick another.',
  sheet_full: 'this sheet holds the most cells it can (50,000 cells or 4 MB).',
  sheets_full: 'the document holds the most sheets or cells it can (200 sheets, 200,000 cells).',
  sheet_too_large: 'a sheet has up to 10,000 rows and 200 columns (A to GR).',
  input_too_long: 'an input is up to 10,000 characters, a formula up to 8,000.',
  formula_invalid: 'a formula cannot be read.',
  format_invalid: 'a format value is not one a cell takes.',
  note_too_long: 'a note is up to 50,000 characters.',
  note_invalid:
    'a note is text of at least one character, with no control characters but line breaks.',
  axis_id_invalid: 'a row or column is not valid.',
  title_invalid: 'a sheet title is 1 to 100 characters.',
  merge_invalid: 'that merge is not valid.',
  filter_invalid: 'that filter is not valid.',
  write_too_large: 'a write changes up to 5,000 cells.',
  write_invalid: 'the change is not one a sheet takes.',
  value_invalid:
    "a value is not one its cell's validation rule allows: read_sheet lists the rules and what each allows.",
  rules_full: 'a sheet holds up to 200 validation rules and 100 format rules.',
  objects_full: 'a sheet holds up to 100 charts.',
  pivot_cell:
    "you can't edit a pivot table's cells: change the pivot table, or write outside its output.",
  filter_overlaps_table:
    "a sheet's filter over a table covers exactly its header and data rows (the table's filter): filter the table's cells only, or remove the filter first.",
  thread_invalid:
    'a comment thread op is malformed, its text is not 1 to 2,000 characters, or its cell or range is not on the sheet.',
  thread_gone: 'that comment thread, or that comment, is no longer there: read the threads again.',
  threads_full: 'a sheet holds up to 1,000 comment threads.',
  thread_full: 'a comment thread holds up to 500 comments.',
  tab_not_found: 'no such tab in this document.',
  sheet_name_invalid:
    "a sheet's name is 1 to 100 characters, never ' at either end, and none of [ ] * ? / \\ :.",
  sheet_name_taken: 'another sheet of this spreadsheet is called that.',
  workbook_full:
    'the spreadsheet holds the most it can: 1,000,000 rows and 20,000,000 cells (rows times columns) over every sheet, and 1 GiB.',
  sheet_last_visible:
    'a spreadsheet always shows at least one sheet: show another before hiding or deleting this one.',
  rows_invalid:
    'rows are asked as <from>-<to> by position, from not past to, up to 5,000 rows a page.',
  protected:
    'those cells are protected: only the owner (or Editors, as the protection says) may change them. Write elsewhere, or ask the owner.',
};

// What a refused writeRows says: the formula that cannot be read, or the value too long for a cell, by its cell (on
// a sheet named when several are written at once).
export function rowsRefusal(
  made: { error: string; at?: string; why?: string },
  sheet?: string,
): { ok: false; code: string; message: string } {
  const at = sheet ? `"${sheet}"!${made.at}` : made.at;
  return made.error === 'input_too_long'
    ? {
        ok: false,
        code: 'input_too_long',
        message: `The value in ${at} is too long for a cell: a Plan Sheet's holds up to 10,000 characters, a spreadsheet's up to 50,000.`,
      }
    : {
        ok: false,
        code: 'formula_invalid',
        message: `The formula in ${at} cannot be read: ${made.why}.`,
      };
}
