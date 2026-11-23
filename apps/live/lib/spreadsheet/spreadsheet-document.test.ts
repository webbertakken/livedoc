// A new spreadsheet (docs/specs/029-sheets/grid-and-editing.md "The grid"): one sheet, Google's grid and line sizes.
import { describe, expect, it } from 'vitest';
import { spreadsheetDocumentContent } from './spreadsheet-document';

describe('spreadsheetDocumentContent', () => {
  it('makes Sheet1 of 1,000 rows by 26 columns, 100 px columns and 21 px rows its own (D169)', () => {
    const content = spreadsheetDocumentContent('tab1');
    const [sheet] = content.sheets!;
    expect(sheet).toMatchObject({ tabId: 'tab1', title: 'Sheet1' });
    expect([sheet!.layout!.rows.length, sheet!.layout!.cols.length]).toEqual([1_000, 26]);
    expect([sheet!.layout!.colWidth, sheet!.layout!.rowHeight]).toEqual([100, 21]);
    expect(content.tab).toMatchObject({ id: 'tab1', name: 'Sheet1' });
  });
});
