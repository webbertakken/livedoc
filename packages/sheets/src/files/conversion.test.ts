// docs/specs/029-sheets/files-and-print.md "Converting" (D87, D88): what the new format's file cannot hold that the
// old one could, one line a kind; standard-mapping.md "Values in XLSX" (D89) for Excel's bounds.
import { describe, expect, it } from 'vitest';
import { CellMap } from '../cells/cell-map';
import { compileFormula } from '../formula/stored';
import { cellKey, emptyLayout, emptySheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import {
  conversionLosses,
  convertedFormat,
  formulaFate,
  lackingFunctions,
  workbookConversion,
} from './conversion';
import type { FileCell, FileSheet, WorkbookFile } from './workbook-file';
import { XLSX_FORMULA_MAX, XLSX_TEXT_MAX } from './xlsx-bounds';

const sheet = (name: string, cells: FileCell[]): FileSheet => ({ name, rows: 10, cols: 10, cells });
const file = (...sheets: FileSheet[]): WorkbookFile => ({ sheets });
// A formula within LiveDoc's 8,000 characters that Excel's prefixes take past its 8,192.
const PREFIXED = `=${Array.from({ length: 1_000 }, () => 'XOR(1)').join('+')}`;
const formula = (f: string, r = 0, c = 0): FileCell & { formula: string } => ({
  r,
  c,
  formula: f,
  value: { k: 'n', v: 1 },
});

describe('convertedFormat', () => {
  it('goes to Excel from either ODF form, and to the ODF package from Excel', () => {
    expect(convertedFormat('ods')).toBe('xlsx');
    expect(convertedFormat('fods')).toBe('xlsx');
    expect(convertedFormat('xlsx')).toBe('ods');
  });
});

describe('formulaFate', () => {
  it('reads a formula Excel holds as native, one it wraps as uncalculated, one too long as unwritten', () => {
    expect(formulaFate(formula('=SUM(A1:A3)'), 'xlsx')).toBe('native');
    expect(formulaFate(formula('=EUROCONVERT(1, "DEM", "EUR")'), 'xlsx')).toBe('uncalculated');
    expect(formulaFate(formula('={A1, 2}'), 'xlsx')).toBe('uncalculated');
    expect(formulaFate(formula(PREFIXED), 'xlsx')).toBe('unwritten');
    const longCache = {
      ...formula('={A1, 2}'),
      value: { k: 's' as const, v: 'y'.repeat(XLSX_FORMULA_MAX) },
    };
    expect(formulaFate(longCache, 'xlsx')).toBe('unwritten');
  });

  it('reads a Google-only function as uncalculated in ODF, and what OpenFormula cannot say as unwritten', () => {
    expect(formulaFate(formula('=EUROCONVERT(1, "DEM", "EUR")'), 'ods')).toBe('native');
    expect(formulaFate(formula('=QUERY(A1:B2, "select A")'), 'fods')).toBe('uncalculated');
    expect(formulaFate(formula('=SUM(A1#)'), 'ods')).toBe('unwritten');
  });
});

describe('lackingFunctions', () => {
  it('names the functions each format’s apps lack, and none for a formula that does not parse', () => {
    expect(lackingFunctions('=QUERY(A1:B2, "x") + EASTERSUNDAY(2024) + SUM(1)', 'xlsx')).toEqual([
      'QUERY',
      'EASTERSUNDAY',
    ]);
    expect(lackingFunctions('=QUERY(A1:B2, "x") + EASTERSUNDAY(2024)', 'ods')).toEqual(['QUERY']);
    expect(lackingFunctions('=SUM(', 'xlsx')).toEqual([]);
  });
});

describe('conversionLosses', () => {
  it('loses nothing within one standard', () => {
    const wide = file(sheet('A very long sheet name past Excel’s limit', [formula('=SUM(A1#)')]));
    expect(conversionLosses(wide, 'ods', 'fods')).toEqual([]);
  });

  it('lists what Excel cannot hold that ODF could, one line a kind', () => {
    const long = 'Quarterly results for the northern region';
    const losses = conversionLosses(
      file(
        sheet(long, [
          formula('=EASTERSUNDAY(2024)'),
          formula('=EUROCONVERT(1, "DEM", "EUR")', 0, 1),
          formula('={A1, 2}', 0, 2),
          // Google-only in both formats: no loss.
          formula('=QUERY(A1:B2, "select A")', 0, 3),
          formula(PREFIXED, 0, 4),
          { r: 1, c: 0, value: { k: 's', v: 'y'.repeat(XLSX_TEXT_MAX + 1) } },
          { r: 1, c: 1, value: { k: 's', v: 'short' } },
        ]),
        sheet('Wide', [{ r: 0, c: 16_384, value: { k: 'n', v: 1 } }, formula('=SUM(A1:B2)')]),
      ),
      'ods',
      'xlsx',
    );
    expect(losses).toEqual([
      {
        k: 'sheet_renamed',
        count: 1,
        names: [{ from: long, to: 'Quarterly results for the north' }],
      },
      { k: 'formula_uncalculated', count: 3, functions: ['EASTERSUNDAY', 'EUROCONVERT'] },
      { k: 'formula_unwritten', count: 1 },
      { k: 'text_cut', count: 1 },
      { k: 'columns_cut', count: 1, sheets: ['Wide'] },
    ]);
  });

  it('lists the formulas OpenFormula cannot say, going to ODF, and nothing Excel already could not', () => {
    const losses = conversionLosses(
      file(
        sheet('Sheet1', [
          formula('=SUM(A1#)'),
          formula('=SUM(A1:B2 B1:C3)', 0, 1),
          formula('=QUERY(A1:B2, "select A")', 0, 2),
          { r: 0, c: 3, value: { k: 's', v: 'y'.repeat(XLSX_TEXT_MAX + 1) } },
        ]),
      ),
      'xlsx',
      'ods',
    );
    expect(losses).toEqual([{ k: 'formula_unwritten', count: 2 }]);
  });

  it('lists a formula wrapped for another reason without names', () => {
    const losses = conversionLosses(file(sheet('Sheet1', [formula('={A1, 2}')])), 'fods', 'xlsx');
    expect(losses).toEqual([{ k: 'formula_uncalculated', count: 1, functions: [] }]);
  });

  it('lists nothing for a workbook both formats hold alike', () => {
    expect(conversionLosses(file(sheet('Sheet1', [formula('=1+1')])), 'ods', 'xlsx')).toEqual([]);
  });

  // formulas.md, the file's meaning (D97): the formulas the spreadsheet's meaning and the new format's answer otherwise.
  it('lists the formulas that may answer differently in the new format’s meaning', () => {
    const both = file(
      sheet('Sheet1', [formula('=SORT(A1:A3, 1, -1)'), formula('=CEILING(-2.5, -1)', 1)]),
    );
    expect(conversionLosses(both, 'ods', 'xlsx', 'openformula')).toEqual([
      { k: 'answers_differ', count: 1, functions: ['CEILING'] },
    ]);
    expect(conversionLosses(both, 'ods', 'xlsx')).toEqual([
      { k: 'answers_differ', count: 1, functions: ['SORT'] },
    ]);
    expect(conversionLosses(both, 'xlsx', 'ods', 'ooxml')).toEqual([
      { k: 'answers_differ', count: 1, functions: ['CEILING'] },
    ]);
  });
});

describe('workbookConversion', () => {
  let n = 7;
  const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
  const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });
  const longName = 'A sheet name well past thirty-one characters';
  const sheets = [
    emptySheet({ id: 'sheetOne1', tabId: 't1', title: longName, layout: emptyLayout(rand, 2, 2) }),
  ];

  it('works the losses out from the sheets as a download would', () => {
    const converted = workbookConversion(sheets, record, 'xlsx');
    expect(converted.from).toBe('ods');
    expect(converted.to).toBe('xlsx');
    expect(converted.losses.map((loss) => loss.k)).toEqual(['sheet_renamed']);
  });

  it('lists formulas by the spreadsheet’s own meaning', () => {
    const { layout } = sheets[0]!;
    const compiled = compileFormula('=CEILING(-2.5, -1)', {
      own: { id: 'sheetOne1', title: longName, layout },
      byTitle: () => undefined,
      byId: () => undefined,
    });
    if (!compiled.ok) throw new Error('formula');
    const withFormula = [
      {
        ...sheets[0]!,
        cells: CellMap.from([
          [cellKey(layout.rows[0]!, layout.cols[0]!), { input: { f: compiled.formula } }],
        ]),
      },
    ];
    const kinds = (r: WorkbookRecord) =>
      workbookConversion(withFormula, r, 'xlsx').losses.map((l) => l.k);
    expect(kinds(record)).toEqual(['sheet_renamed']);
    expect(kinds(WorkbookRecord.opened(record, 'ods'))).toEqual([
      'sheet_renamed',
      'answers_differ',
    ]);
  });

  it('works nothing out within one standard', () => {
    expect(workbookConversion(sheets, record, 'fods')).toEqual({
      from: 'ods',
      to: 'fods',
      losses: [],
    });
  });
});
