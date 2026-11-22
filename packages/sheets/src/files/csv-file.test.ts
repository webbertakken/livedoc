// docs/specs/029-sheets/files-and-print.md "Import" (D117) and "Download" (D118): a CSV or TSV opened as one sheet
// named after its file, its encoding and separator found, each value read as typed, cut at the workbook's limits and
// named; a sheet downloaded as values as shown, injection-safe, a TSV quoted as a CSV is.
import { describe, expect, it } from 'vitest';
import { CellMap } from '../cells/cell-map';
import { parseCsv } from '../csv';
import { cellKey, emptyLayout, emptySheet, type Sheet } from '../sheet';
import { WorkbookRecord } from '../workbook-record';
import { WORKBOOK_COLS_MAX } from '../workbook/workbook-limits';
import { sheetsFromText, textFileSplitOf, writeSheetText } from './csv-file';

let n = 11;
const rand = () => (n = (n * 16807) % 2147483647) / 2147483647;
const utf8 = (text: string) => new TextEncoder().encode(text);
const record = WorkbookRecord.create({ locale: 'en-GB', timeZone: 'UTC' });

// The read's cells by position: each input (and format) at its row and column.
function cellsOf(made: ReturnType<typeof sheetsFromText>) {
  const sheet = made.sheets[0]!;
  return sheet.cells.map((cell) => ({
    at: [sheet.layout.rows.indexOf(cell.r), sheet.layout.cols.indexOf(cell.c)],
    i: cell.i,
    ...(cell.f ? { f: cell.f } : {}),
  }));
}

describe('textFileSplitOf', () => {
  it('detects a .csv’s separator and splits a .tsv or .txt by tabs', () => {
    expect(textFileSplitOf('Q3.CSV')).toBe('detect');
    expect(textFileSplitOf('Q3.tsv')).toBe('tab');
    expect(textFileSplitOf('notes.txt')).toBe('tab');
    expect(textFileSplitOf('Q3.xlsx')).toBeNull();
    expect(textFileSplitOf('README')).toBeNull();
  });
});

describe('sheetsFromText', () => {
  it('makes one sheet named after the file, at least a new sheet’s grid, each value read as typed', () => {
    const made = sheetsFromText(
      utf8('Item,Amount,When\nTea,"1,200.50",03/04/2026\nTotal,=SUM(B2:B2),50%\nCake,£5,\n'),
      'detect',
      'Q3 budget',
      'en-GB',
      rand,
    );
    expect(made.encoding).toBe('utf-8');
    expect(made.losses).toEqual([]);
    const sheet = made.sheets[0]!;
    expect(sheet.title).toBe('Q3 budget');
    expect([sheet.layout.rows.length, sheet.layout.cols.length]).toEqual([1000, 26]);
    const cells = cellsOf(made);
    expect(cells.find((c) => c.at.join() === '0,0')?.i).toEqual({ s: 'Item' });
    expect(cells.find((c) => c.at.join() === '1,1')?.i).toEqual({ n: 1200.5 });
    expect(cells.find((c) => c.at.join() === '1,2')).toMatchObject({ f: { nf: 'date' } });
    expect(cells.find((c) => c.at.join() === '2,1')?.i).toHaveProperty('f');
    expect(cells.find((c) => c.at.join() === '2,2')).toMatchObject({
      i: { n: 0.5 },
      f: { nf: 'percent' },
    });
    expect(cells.find((c) => c.at.join() === '3,1')).toMatchObject({
      i: { n: 5 },
      f: { cur: '£' },
    });
    expect(cells.find((c) => c.at.join() === '3,2')).toBeUndefined();
  });

  it('reads Windows-1252 and semicolons as Excel writes them where the decimal mark is a comma', () => {
    // "Café;3,50" in Windows-1252.
    const made = sheetsFromText(
      new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x3b, 0x33, 0x2c, 0x35, 0x30]),
      'detect',
      'Prices',
      'en-GB',
      rand,
    );
    expect(made.encoding).toBe('windows-1252');
    expect(cellsOf(made).map((c) => c.i)).toEqual([{ s: 'Café' }, { s: '3,50' }]);
  });

  it('splits a TSV by tabs whatever its first line holds, and keeps a formula that cannot be read as text', () => {
    const made = sheetsFromText(utf8('a,b\tc\n=SUM(\t\n'), 'tab', 'Tabs', 'en-GB', rand);
    expect(cellsOf(made).map((c) => [c.at.join(), c.i])).toEqual([
      ['0,0', { s: 'a,b' }],
      ['0,1', { s: 'c' }],
      ['1,0', { s: '=SUM(' }],
    ]);
  });

  it('names a sheet cut at the workbook’s columns, and text cut to what a cell holds', () => {
    const wide = Array.from({ length: WORKBOOK_COLS_MAX + 1 }, () => 'x').join(',');
    const long = 'y'.repeat(50_001);
    const made = sheetsFromText(utf8(`${wide}\n${long}\n`), 'detect', 'Wide', 'en-GB', rand);
    expect(made.losses).toEqual([
      { k: 'sheet_cut', sheet: 'Wide', rows: 1000, cols: WORKBOOK_COLS_MAX },
      { k: 'text_cut', sheet: 'Wide', cells: 1 },
    ]);
    expect(made.sheets[0]!.cells.at(-1)!.i).toEqual({ s: 'y'.repeat(50_000) });
  });

  it('names the sheet of a file with no name Sheet1, and says so', () => {
    const made = sheetsFromText(utf8('a\n'.repeat(3)), 'detect', '', 'en-GB', rand);
    expect(made.sheets[0]!.title).toBe('Sheet1');
    expect(made.losses).toEqual([{ k: 'sheet_renamed', from: '', to: 'Sheet1' }]);
  });
});

describe('writeSheetText', () => {
  const layout = emptyLayout(rand, 3, 2);
  const sheet: Sheet = {
    ...emptySheet({ id: 'sheetOne1', tabId: 't1', title: 'Sheet1', layout }),
    cells: CellMap.from([
      [cellKey(layout.rows[0]!, layout.cols[0]!), { input: { s: '=cmd|calc' } }],
      [cellKey(layout.rows[0]!, layout.cols[1]!), { input: { s: 'a\tb' } }],
      [
        cellKey(layout.rows[1]!, layout.cols[0]!),
        { input: { n: -1200.5 }, format: { nf: 'number' } },
      ],
    ]),
  };

  it('writes the open sheet’s values as shown, made safe, as CSV or TSV', () => {
    expect(writeSheetText([sheet], record, 't1', ',')).toEqual({
      text: `'=cmd|calc,"a\tb"\r\n"-1,200.50",\r\n`,
      title: 'Sheet1',
    });
    const tsv = writeSheetText([sheet], record, 't1', '\t')!.text;
    expect(tsv).toBe(`'=cmd|calc\t"a\tb"\r\n"-1,200.50"\t\r\n`);
    expect(parseCsv(tsv, '\t').rows).toEqual([
      ["'=cmd|calc", 'a\tb'],
      ['-1,200.50', ''],
    ]);
  });

  it('answers null for a tab with no sheet', () => {
    expect(writeSheetText([sheet], record, 'gone', ',')).toBeNull();
  });
});
