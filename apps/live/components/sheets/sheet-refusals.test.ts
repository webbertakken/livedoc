// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", "Limits": a spreadsheet's sheet changes refused.
import { describe, expect, it } from 'vitest';
import { sheetRefusalMessage } from './sheet-refusals';

describe('sheetRefusalMessage', () => {
  it("says a spreadsheet's sheet refusals in its own words", () => {
    expect(sheetRefusalMessage('sheets_full', true)).toBe('A spreadsheet holds up to 200 sheets');
    expect(sheetRefusalMessage('sheets_full')).toBe('This document holds the most sheets it can');
    expect(sheetRefusalMessage('sheet_last_visible', true)).toBe(
      'A spreadsheet keeps at least one sheet',
    );
    expect(sheetRefusalMessage('sheet_exists', true)).toBe(
      'That sheet is already back in this spreadsheet',
    );
  });
});
