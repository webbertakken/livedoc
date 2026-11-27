// docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", "Limits": a spreadsheet's sheet changes refused.
import { describe, expect, it } from 'vitest';
import { sheetRefusalMessage, writeRefusalMessage } from './sheet-refusals';

describe('sheetRefusalMessage', () => {
  it("says a spreadsheet's sheet refusals in its own words", () => {
    expect(sheetRefusalMessage('sheets_full', true)).toBe('A spreadsheet holds up to 200 sheets');
    expect(sheetRefusalMessage('sheets_full')).toBe('This document holds the most sheets it can');
    expect(sheetRefusalMessage('sheet_last_visible', true)).toBe(
      'A spreadsheet keeps at least one sheet shown',
    );
    expect(sheetRefusalMessage('tab_not_found', true)).toBe(
      'The sheet it went beside is no longer in this spreadsheet',
    );
    expect(sheetRefusalMessage('sheet_exists', true)).toBe(
      'That sheet is already back in this spreadsheet',
    );
  });
});

// data-tools.md "Protected ranges": a protected range's refusal says who may change it, in the room's words.
describe('writeRefusalMessage', () => {
  it('says a protection’s refusal as the room words it', () => {
    const line = 'This range is protected: only Editors can change it.';
    expect(writeRefusalMessage({ error: 'protected', at: 'prot01', line })).toBe(line);
    expect(writeRefusalMessage({ error: 'protected' })).toBe("Couldn't save that change");
  });
});
