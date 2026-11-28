// The corpus's files (docs/specs/029-sheets/standard-mapping.md "The corpus", D119): which Excel workbooks it takes
// from Apache POI's test data and at which commit, which LibreOffice saves as Excel too, which Google Sheets saves,
// and the workbook of Google-only functions Google Sheets is given.
import { solidPng } from '@livedoc/office-packages/testing';
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
    'ExcelPivotTableSample.xlsx',
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
    'ExcelPivotTableSample.xlsx',
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

// The plain sheet Google's smart chips are added beside (make-corpus.make.ts, CORPUS_SOURCE=google-chips).
export const SMART_CHIPS: WorkbookFile = {
  sheets: [
    { name: 'Plain', rows: 1, cols: 1, cells: [{ r: 0, c: 0, value: { k: 's', v: 'Plain' } }] },
  ],
};

// Pictures over the cells (standard-mapping.md "Pictures in the file", D628): a red picture with alt text at B2 and a
// blue one at D5, as LiveDoc writes them; LibreOffice and Google Sheets each save it in their own forms.
export const PICTURES: WorkbookFile = {
  sheets: [
    {
      name: 'Pictures',
      rows: 8,
      cols: 6,
      cells: [{ r: 0, c: 0, value: { k: 's', v: 'Pictures over the cells' } }],
      pictures: [
        {
          imageId: 'red',
          at: { r: 1, c: 1, dx: 4, dy: 6 },
          width: 120,
          height: 80,
          alt: 'A red box',
        },
        { imageId: 'blue', at: { r: 4, c: 3, dx: 0, dy: 0 }, width: 48, height: 48 },
      ],
    },
  ],
  pictureBytes: new Map([
    ['red', { data: solidPng(60, 40, [200, 30, 30]), type: 'image/png' }],
    ['blue', { data: solidPng(24, 24, [30, 60, 200]), type: 'image/png' }],
  ]),
};
