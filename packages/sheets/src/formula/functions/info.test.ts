// The information functions the oracle cannot reach (docs/specs/029-sheets/formulas.md "Functions": Information):
// what CELL and ISDATE read of a cell's format, its column and its place, and SHEETS over the workbook.
import { describe, expect, it } from 'vitest';
import { parseA1 } from '../../address';
import { cellKey, type CellFormat } from '../../sheet';
import { book } from '../../testing/book';

// A book whose cells (by A1 on its first sheet) carry these formats, read at J20.
function formatted(
  formula: string,
  cells: Record<string, string>,
  formats: Record<string, CellFormat>,
) {
  const b = book({ 'Sheet 1': { ...cells, J20: formula }, Other: { A1: '1' } });
  const sheet = b.sheets[0]!;
  for (const [a1, format] of Object.entries(formats)) {
    const pos = parseA1(a1)!;
    const key = cellKey(sheet.layout.rows[pos.r]!, sheet.layout.cols[pos.c]!);
    sheet.cells.set(key, { ...sheet.cells.get(key), format });
  }
  return b;
}

const at = (
  formula: string,
  cells: Record<string, string> = {},
  formats: Record<string, CellFormat> = {},
) => formatted(formula, cells, formats).v('J20');

describe('ISDATE', () => {
  it('reads a number as a date only when its cell draws one', () => {
    expect(at('=ISDATE(A1)', { A1: '26/10/2026' })).toBe(true);
    expect(at('=ISDATE(A1)', { A1: '46321' })).toBe(false);
    expect(at('=ISDATE(A1)', { A1: '46321' }, { A1: { nf: 'datetime' } })).toBe(true);
    expect(at('=ISDATE(A1)', { A1: '0.5' }, { A1: { nf: 'time' } })).toBe(false);
    expect(at('=ISDATE(A1)', { A1: '46321' }, { A1: { nf: 'custom', nc: 'd mmm yyyy' } })).toBe(
      true,
    );
  });

  it('takes a range whole: TRUE only when every cell is a date', () => {
    expect(at('=ISDATE(A1:A2)', { A1: '26/10/2026', A2: '27/10/2026' })).toBe(true);
    expect(at('=ISDATE(A1:A3)', { A1: '26/10/2026', A2: '27/10/2026' })).toBe(false);
    expect(at('=ISDATE((A1:A2, B1))', { A1: '26/10/2026', A2: '27/10/2026', B1: '1/1/2026' })).toBe(
      true,
    );
    expect(at('=ISDATE((A1, B1))', { A1: '26/10/2026', B1: 'x' })).toBe(false);
    expect(at('=ISDATE({"1/2/2026", "x"})')).toBe(false);
    expect(at('=ISDATE({"1/2/2026", "3/4/2026"})')).toBe(true);
  });

  it('is no date for an error or a number worked out', () => {
    expect(at('=ISDATE(A1)', { A1: '=1/0' })).toBe(false);
    expect(at('=ISDATE(DATE(2026, 1, 1))')).toBe(false);
  });

  it('is the error of a range too large to read', () => {
    const b = book({ A1: '=ISDATE(B1:ZZ2000)' }, { rows: 2000, cols: 702 });
    expect(b.v('A1')).toMatchObject({ e: '#NUM!' });
  });

  it('hears when its cell changes', () => {
    const b = formatted('=ISDATE(A1)', { A1: 'x' }, {});
    expect(b.v('J20')).toBe(false);
    b.set('A1', '="26/10/2026"');
    expect(b.v('J20')).toBe(true);
  });
});

describe('CELL', () => {
  it('tells the place of the top-left cell, on this sheet or another', () => {
    expect(at('=CELL("address", B3:C4)')).toBe('$B$3');
    expect(at('=CELL("address", Other!A1)')).toBe('Other!$A$1');
    expect(at('=CELL("sheet", B3)')).toBe('Sheet 1');
    expect(at('=CELL("row", (B3:C4, A1))')).toBe(3);
    expect(at('=CELL("Col")')).toBe(10);
  });

  it('reads the format: its code, coloured negatives, brackets', () => {
    const f = (format: CellFormat, type = 'format') =>
      at(`=CELL("${type}", A1)`, { A1: '1' }, { A1: format });
    expect(f({ nf: 'number' })).toBe(',2');
    expect(f({ nf: 'percent', dp: 0 })).toBe('P0');
    expect(f({ nf: 'currency' })).toBe('C2');
    expect(f({ nf: 'scientific', dp: 3 })).toBe('S3');
    expect(f({ nf: 'date' })).toBe('D4');
    expect(f({ nf: 'time' })).toBe('D8');
    expect(f({ nf: 'auto', dp: 1 })).toBe('F1');
    expect(f({ nf: 'custom', nc: '#,##0_);[Red](#,##0)' })).toBe(',0-');
    expect(f({ nf: 'custom', nc: '#,##0_);[Red](#,##0)' }, 'color')).toBe(1);
    expect(f({ nf: 'custom', nc: '(0.00)' }, 'parentheses')).toBe(1);
    expect(f({ nf: 'number' }, 'color')).toBe(0);
    expect(f({ nf: 'number' }, 'parentheses')).toBe(0);
  });

  it('reads the alignment as a prefix and the column as characters', () => {
    expect(at('=CELL("prefix", A1)', { A1: 'a' }, { A1: { ha: 'l' } })).toBe("'");
    expect(at('=CELL("prefix", A1)', { A1: 'a' }, { A1: { ha: 'r' } })).toBe('"');
    expect(at('=CELL("prefix", A1)', { A1: 'a' }, { A1: { ha: 'c' } })).toBe('^');
    expect(at('=CELL("prefix", A1)', { A1: 'a' })).toBe('');
    // A 120-pixel column: (120 - 5) / 7 = 16.4 characters.
    expect(at('=CELL("width", A1)')).toBe(16);
  });

  it('reads its own cell’s format without a loop, and its own contents as one', () => {
    expect(at('=CELL("format")', {}, { J20: { nf: 'percent' } })).toBe('P2');
    expect(at('=CELL("contents")')).toMatchObject({ e: '#REF!' });
  });

  it('answers a file name as a LiveDoc document has it, and protection by the sheet’s (D42)', () => {
    expect(at('=CELL("filename", A1)')).toBe('');
    expect(at('=CELL("protect", A1)')).toBe(0);
    const b = book({ 'Sheet 1': { J20: '=CELL("protect", A1)', J21: '=CELL("protect", B5)' } });
    const { layout } = b.sheets[0]!;
    // A warning protection over A1 still protects it.
    Object.assign(layout, {
      protections: [
        {
          id: 'p1',
          can: 'warn',
          range: {
            r1: layout.rows[0]!,
            c1: layout.cols[0]!,
            r2: layout.rows[1]!,
            c2: layout.cols[0]!,
          },
        },
      ],
    });
    expect([b.v('J20'), b.v('J21')]).toEqual([1, 0]);
  });

  it('refuses what it cannot tell', () => {
    expect(at('=CELL(1, A1)')).toMatchObject({ e: '#VALUE!' });
    expect(at('=CELL("coord", A1)')).toMatchObject({ e: '#VALUE!' });
    expect(at('=CELL("row", 5)')).toMatchObject({ e: '#N/A' });
    expect(at('=CELL("row", Gone!A1)')).toMatchObject({ e: '#REF!' });
  });

  it('hears when its cell’s format changes', () => {
    const b = formatted('=CELL("format", A1)', { A1: '1' }, {});
    expect(b.v('J20')).toBe('G');
    const sheet = b.sheets[0]!;
    const key = cellKey(sheet.layout.rows[0]!, sheet.layout.cols[0]!);
    const cells = sheet.cells.copy();
    cells.set(key, { ...cells.get(key), format: { nf: 'percent' } });
    const next = { ...sheet, cells };
    b.wb.updateSheet(next, [key]);
    expect(b.v('J20')).toBe('P2');
  });
});

describe('SHEETS', () => {
  it('counts the workbook’s sheets, or those a reference spans', () => {
    expect(at('=SHEETS()')).toBe(2);
    expect(at('=SHEETS(A1)')).toBe(1);
    expect(at('=SHEETS((A1, Other!A1))')).toBe(2);
    expect(at('=SHEETS(1)')).toMatchObject({ e: '#VALUE!' });
  });
});
