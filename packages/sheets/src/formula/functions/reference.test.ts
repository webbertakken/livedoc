// Lookup's reference functions beyond the oracle's cases (docs/specs/029-sheets/formulas.md "Functions": Lookup):
// INDIRECT's R1C1 texts, INDEX's area of a union (D38), FORMULATEXT on its own cell, SHEET and ADDRESS at the edges.
import { describe, expect, it } from 'vitest';
import { book, calc } from '../../testing/book';

const T = { A1: '1', B1: '2', A2: '3', B2: '4', C3: '9' };

describe('INDIRECT in R1C1', () => {
  it.each([
    ['=INDIRECT("R1C2", FALSE)', 2],
    ['=INDIRECT("R[-17]C[-7]", FALSE)', 9],
    ['=SUM(INDIRECT("R1", FALSE))', 3],
    ['=SUM(INDIRECT("C1:C2", FALSE))', 10],
    ['=SUM(INDIRECT("R1C1:R2C2", FALSE))', 10],
    ['=INDIRECT("\'Sheet 1\'!R2C1", FALSE)', 3],
    ['=INDIRECT("r2c2", FALSE)', 4],
  ])('%s', (formula, value) => {
    expect(calc(formula, T)).toBe(value);
  });

  it.each([
    '=INDIRECT("R0C1", FALSE)',
    '=INDIRECT("R1C1:R2", FALSE)',
    '=INDIRECT("R1C1:R2C2:R3C3", FALSE)',
    '=INDIRECT("Nowhere!R1C1", FALSE)',
    '=INDIRECT("X1", FALSE)',
    '=INDIRECT("", FALSE)',
    '=INDIRECT("R99999C1", FALSE)',
    '=INDIRECT(5, FALSE)',
  ])('%s is #REF!', (formula) => {
    expect(calc(formula, T)).toMatchObject({ e: '#REF!' });
  });

  it('counts R and C alone as its own row and column', () => {
    const b = book({ C3: '=INDIRECT("R[-1]C", FALSE)', C2: '7' });
    expect(b.v('C3')).toBe(7);
  });
});

describe('INDEX of a union', () => {
  it('picks the area named by its fourth argument', () => {
    expect(calc('=INDEX((A1:A2, B1:B2), 2, 1, 2)', T)).toBe(4);
    expect(calc('=INDEX((A1:A2, B1:B2), 1, 1)', T)).toBe(1);
    expect(calc('=INDEX((A1:A2, B1:B2), 1, 1, 3)', T)).toMatchObject({ e: '#REF!' });
    expect(calc('=INDEX(A1:B2, 1, 1, 2)', T)).toMatchObject({ e: '#REF!' });
    expect(calc('=INDEX(A1:B2, 1, 1, "x")', T)).toMatchObject({ e: '#VALUE!' });
  });
});

describe('FORMULATEXT', () => {
  it('reads its own cell without a loop, and hears a retyped cell', () => {
    const b = book({ A1: '=FORMULATEXT(A1)', B1: '=1+1', C1: '=FORMULATEXT(B1)' });
    expect(b.v('A1')).toBe('=FORMULATEXT(A1)');
    expect(b.v('C1')).toBe('=1+1');
    b.set('B1', '=2+2');
    expect(b.v('C1')).toBe('=2+2');
    expect(calc('=FORMULATEXT(1)')).toMatchObject({ e: '#N/A' });
  });
});

describe('SHEET and ADDRESS', () => {
  it('numbers sheets in the spreadsheet’s order', () => {
    const b = book({ One: { A1: '=SHEET()' }, Two: { A1: '=SHEET(One!A1)', B1: '=SHEET("two")' } });
    expect(b.v('A1', 'One')).toBe(1);
    expect(b.v('A1', 'Two')).toBe(1);
    expect(b.v('B1', 'Two')).toBe(2);
    expect(calc('=SHEET(1/0)')).toMatchObject({ e: '#DIV/0!' });
    expect(calc('=SHEET((A1, B1))', T)).toBe(1);
  });

  // spreadsheet.md "Sheets in the sheet bar": a sheet moved is counted in its new place.
  it('counts the sheets again in a new order, keeping those not named after', () => {
    const b = book({ One: { A1: '=SHEET()' }, Two: { A1: '=SHEET()' }, Three: { A1: '=SHEET()' } });
    const [one, two, three] = b.wb.sheetList().map((s) => s.id);
    b.wb.orderSheets([three!, 'gone', one!]);
    expect([b.v('A1', 'Three'), b.v('A1', 'One'), b.v('A1', 'Two')]).toEqual([1, 2, 3]);
    const version = b.wb.sheetList();
    b.wb.orderSheets([three!, one!, two!]);
    expect(b.wb.sheetList()).toEqual(version);
  });

  it('writes R1C1 with relative parts, and refuses what it cannot write', () => {
    expect(calc('=ADDRESS(2, 3, 2, FALSE)')).toBe('R2C[3]');
    expect(calc('=ADDRESS(2, 3, 3, FALSE)')).toBe('R[2]C3');
    expect(calc('=ADDRESS("x", 3)')).toMatchObject({ e: '#VALUE!' });
    expect(calc('=ADDRESS(1, "x")')).toMatchObject({ e: '#VALUE!' });
    expect(calc('=ADDRESS(1, 1, "x")')).toMatchObject({ e: '#VALUE!' });
    expect(calc('=ADDRESS(1, 1, 1, "x")')).toMatchObject({ e: '#VALUE!' });
    expect(calc('=ADDRESS(1, 1, 1, TRUE, 1/0)')).toMatchObject({ e: '#DIV/0!' });
  });
});
