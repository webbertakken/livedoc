// One workbook per construct group of the mapping (docs/specs/029-sheets/standard-mapping.md), as a file holds it:
// what the schema validation writes in every format (written-files.validate.ts).
import type { NumberFormatKind } from '../sheet';
import { formatCodeOf } from '../files/number-format-code';
import type { FileCell, WorkbookFile } from '../files/workbook-file';

const sheet = (name: string, cells: FileCell[], rows = 10, cols = 6) => ({
  name,
  rows,
  cols,
  cells,
});

const KINDS: readonly NumberFormatKind[] = [
  'auto',
  'number',
  'percent',
  'currency',
  'accounting',
  'financial',
  'scientific',
  'date',
  'time',
  'datetime',
  'duration',
  'text',
];

const CUSTOM_CODES = [
  '0.000',
  '#,##0.00;[Red]-#,##0.00',
  'dddd d mmmm yyyy',
  '"km "0.0',
  '# ?/?',
  '0.0,,',
];

export const WRITTEN_CONSTRUCTS: Readonly<Record<string, WorkbookFile>> = {
  values: {
    sheets: [
      sheet('Values', [
        { r: 0, c: 0, value: { k: 'n', v: 1.5 } },
        { r: 0, c: 1, value: { k: 'n', v: -1e-12 } },
        { r: 0, c: 2, value: { k: 's', v: ' two\nlines ' } },
        { r: 0, c: 3, value: { k: 'b', v: true } },
        { r: 0, c: 4, value: { k: 'b', v: false } },
        { r: 1, c: 0, value: { k: 's', v: 'tab\there & <there> "quoted"' } },
        { r: 9, c: 5, value: { k: 'n', v: 9 } },
      ]),
    ],
  },
  formulas: {
    sheets: [
      sheet('Sums', [
        { r: 0, c: 0, value: { k: 'n', v: 2 } },
        { r: 0, c: 1, formula: '=A1*2', value: { k: 'n', v: 4 } },
        { r: 1, c: 0, formula: '=1/0', value: { k: 'e', v: '#DIV/0!' } },
        { r: 1, c: 1, formula: '=IF(A1>1,"big","small")', value: { k: 's', v: 'big' } },
        { r: 2, c: 0, formula: "='Other sheet'!A1+1", value: { k: 'n', v: 8 } },
        { r: 2, c: 1, formula: '=GOOGLEFINANCE("GOOG")', value: { k: 'n', v: 100 } },
        { r: 3, c: 0, formula: '=XLOOKUP(2,A1:A2,B1:B2)', value: { k: 'n', v: 4 } },
        { r: 3, c: 1, formula: '=ISBLANK(C9)', value: { k: 'b', v: true } },
      ]),
      sheet('Other sheet', [{ r: 0, c: 0, value: { k: 'n', v: 7 } }]),
    ],
  },
  arrays: {
    sheets: [
      sheet('Arrays', [
        {
          r: 0,
          c: 0,
          formula: '=SEQUENCE(2,3)',
          value: { k: 'n', v: 1 },
          spans: { rows: 2, cols: 3 },
        },
        { r: 0, c: 1, value: { k: 'n', v: 2 } },
        { r: 0, c: 2, value: { k: 'n', v: 3 } },
        { r: 1, c: 0, value: { k: 'n', v: 4 } },
        { r: 1, c: 1, value: { k: 'n', v: 5 } },
        { r: 1, c: 2, value: { k: 'n', v: 6 } },
        { r: 3, c: 0, formula: '={1,2;3,4}', value: { k: 'n', v: 1 }, spans: { rows: 2, cols: 2 } },
        { r: 3, c: 1, value: { k: 'n', v: 2 } },
        { r: 4, c: 0, value: { k: 'n', v: 3 } },
        { r: 4, c: 1, value: { k: 'n', v: 4 } },
      ]),
    ],
  },
  formats: {
    sheets: [
      sheet(
        'Formats',
        [
          ...KINDS.flatMap((nf, r): FileCell[] => {
            const code = formatCodeOf({ nf, dp: 3 }, 'en-GB');
            return code === null
              ? []
              : [{ r, c: 0, value: { k: 'n', v: 45_000.25 }, format: code }];
          }),
          ...CUSTOM_CODES.map((format, r): FileCell => ({
            r,
            c: 1,
            value: { k: 'n', v: 1234.5 },
            format,
          })),
          { r: 0, c: 2, format: '0.00' },
        ],
        20,
      ),
    ],
  },
  bounds: {
    sheets: [
      sheet(
        'A sheet name of more than thirty-one characters',
        [
          { r: 0, c: 0, value: { k: 's', v: 'x'.repeat(40_000) } },
          { r: 0, c: 1, formula: `=LEN("${'y'.repeat(9_000)}")`, value: { k: 'n', v: 9_000 } },
          { r: 0, c: 16_384, value: { k: 'n', v: 1 } },
        ],
        2,
        16_390,
      ),
      sheet('Empty', []),
    ],
  },
};
