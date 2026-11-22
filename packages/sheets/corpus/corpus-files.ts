// The corpus's files (docs/specs/029-sheets/standard-mapping.md "The corpus", D119): which Excel workbooks it takes
// from Apache POI's test data and at which commit, which LibreOffice saves as Excel too, which Google Sheets saves,
// and the workbook of Google-only functions Google Sheets is given.
import type { WorkbookFile } from '../src/files/workbook-file';

/** Apache POI's commit the Excel files are taken at (test-data/spreadsheet, Apache License 2.0). */
export const POI_COMMIT = 'c94ee8ad9096bdb8cf8e5e59d8d12432e950dbf3';

export const CORPUS = {
  excel: [
    '50096.xlsx',
    '54034.xlsx',
    '55406_Conditional_formatting_sample.xlsx',
    'comments.xlsx',
    'DataValidations-49244.xlsx',
    'DateFormatTests.xlsx',
    'ExcelTables.xlsx',
    'Formatting.xlsx',
    'NumberFormatTests.xlsx',
    'SampleSS.xlsx',
    'shared_formulas.xlsx',
    'table-sample.xlsx',
    'WithConditionalFormatting.xlsx',
    'WithDrawing.xlsx',
    'WithTable.xlsx',
  ],
  libreofficeXlsx: [
    'comments.xlsx',
    'DataValidations-49244.xlsx',
    'NumberFormatTests.xlsx',
    'shared_formulas.xlsx',
  ],
  google: [
    'comments.xlsx',
    'DataValidations-49244.xlsx',
    'NumberFormatTests.xlsx',
    'SampleSS.xlsx',
  ],
} as const;

// A text longer than the 255 characters an Excel formula's string literal holds.
const LONG = 'x'.repeat(300);

/** Google-only functions, a string literal past Excel's 255 characters among them, for Google Sheets to save. */
export const GOOGLE_FUNCTIONS: WorkbookFile = {
  sheets: [
    {
      name: 'Google',
      rows: 8,
      cols: 2,
      cells: [
        { r: 0, c: 0, value: { k: 's', v: 'abc' } },
        { r: 1, c: 0, value: { k: 'n', v: 3 } },
        { r: 0, c: 1, formula: '=REGEXMATCH(A1,"b")', value: { k: 'b', v: true } },
        { r: 1, c: 1, formula: '=REGEXREPLACE(A1,"b","x")', value: { k: 's', v: 'axc' } },
        { r: 2, c: 1, formula: '=SPLIT("a,b",",")', value: { k: 's', v: 'a' } },
        { r: 3, c: 1, formula: '=ARRAYFORMULA(A2*2)', value: { k: 'n', v: 6 } },
        { r: 4, c: 1, formula: `=LEN(REGEXREPLACE("${LONG}","y","z"))`, value: { k: 'n', v: 300 } },
        { r: 5, c: 1, formula: '=JOIN("-",A1,A2)', value: { k: 's', v: 'abc-3' } },
      ],
    },
  ],
};
