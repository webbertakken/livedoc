// docs/specs/029-sheets/files-and-print.md "The import report" (D120): the words of each line, counted, naming up to
// three, and saying when there are more.
import { describe, expect, it } from 'vitest';
import type { ReportedLoss } from '@livedoc/sheets/files';
import { IMPORT_REPORT_LEAD, importReportLine, importReportTitle } from './import-report-copy';

const line = (loss: ReportedLoss) => importReportLine(loss);

describe('the import report’s copy', () => {
  it('titles the report by the spreadsheet and leads its list', () => {
    expect(importReportTitle('Budget')).toBe('Opened “Budget”');
    expect(IMPORT_REPORT_LEAD).toBe('Some of what the file holds is not in the spreadsheet:');
  });

  it('says each line in the spec’s words, one and many', () => {
    const cases: [ReportedLoss, string][] = [
      [{ k: 'sheets_cut', count: 3, names: [] }, '3 sheets past the 200th are left out'],
      [{ k: 'sheets_cut', count: 1, names: [] }, '1 sheet past the 200th is left out'],
      [{ k: 'sheet_unread', count: 1, names: ['Chart1'] }, '1 chart sheet is left out: Chart1'],
      [
        { k: 'sheet_cut', count: 1, names: ['Data'] },
        '1 sheet is cut to the spreadsheet’s limits: Data',
      ],
      [
        { k: 'cells_cut', count: 1, names: ['Data'] },
        'Cells past the first 2,000,000 are left out of 1 sheet: Data',
      ],
      [
        { k: 'formula_unread', count: 4, names: ['Data!B2', 'Data!B3', 'Data!C9'] },
        '4 formulas LiveDoc cannot read keep only their last values: Data!B2, Data!B3, Data!C9 and more',
      ],
      [
        { k: 'formula_unread', count: 1, names: ['Data!B2'] },
        '1 formula LiveDoc cannot read keeps only its last value: Data!B2',
      ],
      [{ k: 'formula_unwritten', count: 2, names: [] }, '2 formulas are written as values only'],
      [{ k: 'text_cut', count: 1, names: ['Data'] }, '1 cell’s text is cut to 50,000 characters'],
      [{ k: 'text_cut', count: 4, names: ['Data'] }, '4 cells’ text is cut to 50,000 characters'],
      [
        { k: 'macros', count: 2, names: ['Basic/x.xml'] },
        'The file’s macros are removed and never run',
      ],
      [
        { k: 'signature', count: 1, names: [] },
        'The file’s digital signature is removed, as LiveDoc changes what it signed',
      ],
      [{ k: 'objects', count: 2, names: ['a.bin'] }, '2 embedded objects are left out'],
      [{ k: 'kept', count: 3, names: [] }, '3 things the file holds could not be kept'],
      [
        { k: 'answers_differ', count: 2, names: ['CEILING', 'SORT'] },
        '2 formulas may answer differently: CEILING and SORT',
      ],
      [
        { k: 'format_unread', count: 2, names: ['Data!A1'] },
        '2 number formats LiveDoc cannot read are left out: Data!A1 and more',
      ],
      [
        { k: 'format_unread', count: 1, names: ['Data!A1'] },
        '1 number format LiveDoc cannot read is left out: Data!A1',
      ],
      [{ k: 'format_unwritten', count: 1, names: [] }, '1 number format is left out of the file'],
      [
        { k: 'format_approximated', count: 1, names: ['[$-F800]dddd'] },
        '1 number format is shown as near as LiveDoc can: [$-F800]dddd',
      ],
      [
        { k: 'formats_cut', count: 1, names: ['Data'] },
        'Formats over long runs of empty cells are left out of 1 sheet: Data',
      ],
      [
        { k: 'styles_unread', count: 2, names: ['Data', 'Totals'] },
        'Rotation, indents, patterned fills and other styling are left out of 2 sheets: Data and Totals',
      ],
      [
        { k: 'format_rule_unread', count: 1, names: ['Data!A2'] },
        '1 conditional formatting rule LiveDoc cannot read is left out: Data!A2',
      ],
      [
        { k: 'format_rule_unread', count: 2, names: ['Data!A2', 'Data!B2'] },
        '2 conditional formatting rules LiveDoc cannot read are left out: Data!A2 and Data!B2',
      ],
      [
        { k: 'sizes_cut', count: 1, names: ['Data'] },
        'Row heights and column widths past the most a sheet holds are left out of 1 sheet: Data',
      ],
      [
        { k: 'chart_rewritten', count: 2, names: ['Models'] },
        '2 charts changed since the file was opened are written as LiveDoc draws charts: Models',
      ],
      [
        {
          k: 'sheet_renamed',
          count: 2,
          names: [
            { from: 'Data', to: 'Data (2)' },
            { from: 'A', to: 'B' },
          ],
        },
        '2 sheet names are changed to fit: “Data” becomes “Data (2)”, “A” becomes “B”',
      ],
    ];
    for (const [loss, words] of cases) expect(line(loss)).toBe(words);
  });
});
