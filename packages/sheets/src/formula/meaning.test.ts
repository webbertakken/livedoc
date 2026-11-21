import { describe, expect, it } from 'vitest';
import { book, calc } from '../testing/book';
import {
  answersDiffer,
  FILE_MEANINGS,
  FORMULA_MEANINGS,
  functionsAnsweringDifferently,
  MEANING_FUNCTIONS,
  type FormulaMeaning,
} from './meaning';
import { FUNCTIONS } from './registry';

// docs/specs/029-sheets/formulas.md "Function catalogue", the file's meaning: each row of "Both accept, answered
// differently", in each meaning.

const inEach = (formula: string, cells: Record<string, string> = {}) =>
  Object.fromEntries(
    FORMULA_MEANINGS.map((meaning) => [meaning, calc(formula, cells, { meaning })]),
  );

const error = (e: string): unknown => expect.objectContaining({ e });

describe('the meanings', () => {
  it('are Google’s and the two standards’', () => {
    expect(FORMULA_MEANINGS).toEqual(['google', 'ooxml', 'openformula']);
    expect(FILE_MEANINGS).toEqual(['ooxml', 'openformula']);
  });
});

describe('the functions answering differently', () => {
  it('lists only functions the engine knows', () => {
    expect(Object.keys(MEANING_FUNCTIONS).filter((name) => !FUNCTIONS[name])).toEqual([]);
  });

  it('differ between two meanings when one lists the function and the other does not', () => {
    expect(answersDiffer('SORT', 'google', 'ooxml')).toBe(true);
    expect(answersDiffer('SORT', 'ooxml', 'openformula')).toBe(false);
    expect(answersDiffer('CEILING', 'ooxml', 'openformula')).toBe(true);
    expect(answersDiffer('CEILING', 'google', 'ooxml')).toBe(false);
    expect(answersDiffer('SUM', 'google', 'openformula')).toBe(false);
  });

  it('names those a formula calls, sorted, and none for one that does not parse', () => {
    const f = '=SORT(A1:A3, 1, -1) + CEILING(SUM(A1:A3), 2) + CELL("sheet", A1)';
    expect(functionsAnsweringDifferently(f, 'ooxml', 'openformula')).toEqual(['CEILING', 'CELL']);
    expect(functionsAnsweringDifferently(f, 'google', 'ooxml')).toEqual(['SORT']);
    expect(functionsAnsweringDifferently('=SORT(', 'google', 'ooxml')).toEqual([]);
  });
});

describe('a spreadsheet’s meaning', () => {
  it('is Google’s when none is given', () => {
    expect(book({ A1: '1' }).wb.meaning).toBe('google');
    expect(book({ A1: '1' }, { meaning: 'ooxml' }).wb.meaning).toBe('ooxml');
  });

  it('CELL("sheet"): the name, or OpenFormula’s sheet number (Info CELL.9)', () => {
    expect(inEach('=CELL("sheet", A1)')).toEqual({
      google: 'Sheet 1',
      ooxml: 'Sheet 1',
      openformula: 1,
    });
    expect(calc('=CELL("sheet", Gone!A1)', {}, { meaning: 'openformula' })).toEqual(error('#REF!'));
  });

  it('SORT(range, 1, -1): ascending in Google’s, descending in both standards’ (Filter SORT.8)', () => {
    const cells = { A1: '2', A2: '3', A3: '1' };
    expect(inEach('=SORT(A1:A3, 1, -1)', cells)).toEqual({ google: 1, ooxml: 3, openformula: 3 });
    expect(inEach('=SORT(A1:A3, 1, 2)', cells)).toEqual({ google: 1, ooxml: 1, openformula: 1 });
    expect(inEach('=SORT(A1:A3, 1, 0)', cells)).toEqual({ google: 3, ooxml: 3, openformula: 3 });
    expect(calc('=SORT(A1:A3, 1, "x")', cells, { meaning: 'ooxml' })).toEqual(error('#VALUE!'));
  });

  it('ADDRESS with a sheet: OpenFormula joins A1 with a dot (Lookup ADDRESS.7)', () => {
    expect(inEach('=ADDRESS(2, 3, 1, TRUE, "Data")')).toEqual({
      google: 'Data!$C$2',
      ooxml: 'Data!$C$2',
      openformula: 'Data.$C$2',
    });
    expect(calc('=ADDRESS(2, 3, 1, FALSE, "Data")', {}, { meaning: 'openformula' })).toBe(
      'Data!R2C3',
    );
  });

  it('CEILING and FLOOR with two arguments: OpenFormula’s mode 0 (Math CEILING.4, FLOOR.4)', () => {
    expect(inEach('=CEILING(-2.5, -1)')).toEqual({ google: -3, ooxml: -3, openformula: -2 });
    expect(inEach('=FLOOR(-2.5, -1)')).toEqual({ google: -2, ooxml: -2, openformula: -3 });
    expect(inEach('=CEILING(-2.5)')).toEqual({ google: -2, ooxml: -2, openformula: -2 });
    expect(calc('=CEILING(2.5, -1)', {}, { meaning: 'openformula' })).toEqual(error('#NUM!'));
  });

  it('DOLLARDE and DOLLARFR: OpenFormula’s places as the unit’s digits (Financial DOLLARDE.1, DOLLARFR.1)', () => {
    const de = inEach('=DOLLARDE(100.01, 8)');
    expect(de.google).toBeCloseTo(100.125, 10);
    expect(de.ooxml).toBeCloseTo(100.125, 10);
    expect(de.openformula).toBeCloseTo(100.0125, 10);
    const fr = inEach('=DOLLARFR(100.125, 8)');
    expect(fr.google).toBeCloseTo(100.01, 10);
    expect(fr.ooxml).toBeCloseTo(100.01, 10);
    expect(fr.openformula).toBeCloseTo(100.1, 10);
  });

  it('CUMIPMT and CUMPRINC: OOXML truncates the periods (Financial CUMIPMT.4, CUMPRINC.4)', () => {
    for (const name of ['CUMIPMT', 'CUMPRINC']) {
      const args = '0.0075, 360, 125000';
      const google = calc(`=${name}(${args}, 3, 4, 0)`);
      const truncated = calc(`=${name}(${args}, 2, 4, 0)`);
      expect(inEach(`=${name}(${args}, 2.1, 4.9, 0)`)).toEqual({
        google,
        ooxml: truncated,
        openformula: google,
      });
    }
  });

  it('the population forms: one number’s spread is 0 in both standards (Statistical STDEVP.3, VARPA.3)', () => {
    for (const name of ['STDEVP', 'VARP', 'STDEV.P', 'VAR.P', 'STDEVPA'])
      expect(inEach(`=${name}(5)`)).toEqual({ google: error('#DIV/0!'), ooxml: 0, openformula: 0 });
    expect(inEach('=VARPA(5)')).toEqual({ google: error('#NUM!'), ooxml: 0, openformula: 0 });
    expect(calc('=VARP(A1)', {}, { meaning: 'ooxml' })).toEqual(error('#DIV/0!'));
    expect(calc('=STDEVP(1, 3)', {}, { meaning: 'openformula' })).toBe(1);
  });

  it('DEVSQ of no number: OpenFormula’s #DIV/0! (Statistical DEVSQ.4)', () => {
    const cells = { A1: 'x', A2: 'y' };
    expect(inEach('=DEVSQ(A1:A2)', cells)).toEqual({
      google: 0,
      ooxml: 0,
      openformula: error('#DIV/0!'),
    });
    expect(calc('=DEVSQ(5)', {}, { meaning: 'openformula' })).toBe(0);
  });

  it('MAXA with typed text: OpenFormula reads it as 0 (Statistical MAXA.4)', () => {
    expect(inEach('=MAXA(1, "x")')).toEqual({
      google: error('#VALUE!'),
      ooxml: error('#VALUE!'),
      openformula: 1,
    });
  });

  it('PERCENTRANK with significance below 1: both standards refuse it (Statistical PERCENTRANK.8)', () => {
    const cells = { A1: '1', A2: '2', A3: '3', A4: '4' };
    expect(inEach('=PERCENTRANK(A1:A4, 2, 0)', cells)).toEqual({
      google: 0.333,
      ooxml: error('#NUM!'),
      openformula: error('#NUM!'),
    });
    expect(calc('=PERCENTRANK.INC(A1:A4, 2, 0)', cells, { meaning: 'ooxml' })).toBe(0.333);
  });

  it('PERMUTATIONA: n^k for any n and k from 0 in both standards (Statistical PERMUTATIONA.3, .4)', () => {
    expect(inEach('=PERMUTATIONA(0, 2)')).toEqual({
      google: error('#NUM!'),
      ooxml: 0,
      openformula: 0,
    });
    expect(inEach('=PERMUTATIONA(3, 4)')).toEqual({
      google: error('#NUM!'),
      ooxml: 81,
      openformula: 81,
    });
    expect(calc('=PERMUTATIONA(0, 0)', {}, { meaning: 'ooxml' })).toBe(1);
    expect(calc('=PERMUTATIONA(-1, 2)', {}, { meaning: 'ooxml' })).toEqual(error('#NUM!'));
  });

  it('F.DIST, cumulative left out: OpenFormula’s cumulative (Statistical F.DIST.6)', () => {
    const density = calc('=F.DIST(15.35, 7, 6, FALSE)');
    const cumulative = calc('=F.DIST(15.35, 7, 6, TRUE)');
    expect(inEach('=F.DIST(15.35, 7, 6)')).toEqual({
      google: density,
      ooxml: density,
      openformula: cumulative,
    });
    const meaning: FormulaMeaning = 'openformula';
    expect(calc('=F.DIST(15.35, 7, 6, FALSE)', {}, { meaning })).toBe(density);
  });
});
