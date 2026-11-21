import { describe, expect, it } from 'vitest';
import { book, calc } from '../testing/book';
import {
  answersDiffer,
  CHAINED_POWER,
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
    expect(
      Object.keys(MEANING_FUNCTIONS).filter((name) => !FUNCTIONS[name] && name !== CHAINED_POWER),
    ).toEqual([]);
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

  it('names a power of a power written without brackets by its operator', () => {
    expect(functionsAnsweringDifferently('=2^3^2', 'google', 'ooxml')).toEqual(['^']);
    expect(functionsAnsweringDifferently('=(2^3)^2', 'google', 'ooxml')).toEqual([]);
    expect(functionsAnsweringDifferently('=2^(3^2)', 'google', 'ooxml')).toEqual([]);
    expect(functionsAnsweringDifferently('=2^3^2', 'ooxml', 'openformula')).toEqual([]);
  });
});

// A row of the table each: Google's answer, and each standard's.
describe('each meaning answers', () => {
  it('2^3^2 from the right in Google’s and from the left in the standards’', () => {
    expect(inEach('=2^3^2')).toEqual({ google: 512, ooxml: 64, openformula: 64 });
    expect(inEach('=2^3^2^0.5')).toEqual({
      google: 2 ** (3 ** (2 ** 0.5)),
      ooxml: 8,
      openformula: 8,
    });
  });

  it('YEARFRAC past a year by Google’s whole years, or OpenFormula’s average year', () => {
    const f = '=YEARFRAC(DATE(2024, 1, 1), DATE(2025, 6, 30), 1)';
    const got = inEach(f) as Record<FormulaMeaning, number>;
    expect(got.google).toBeCloseTo(1 + 180 / 365, 12);
    expect(got.ooxml).toBeCloseTo(1 + 180 / 365, 12);
    expect(got.openformula).toBeCloseTo(546 / 365.5, 12);
  });

  it('ARABIC adds up any numerals, ROMAN(0) is empty and LEN counts characters only in OpenFormula’s', () => {
    expect(inEach('=ARABIC("IIII")')).toEqual({
      google: error('#VALUE!'),
      ooxml: error('#VALUE!'),
      openformula: 4,
    });
    expect(inEach('=ROMAN(0)')).toEqual({
      google: error('#VALUE!'),
      ooxml: error('#VALUE!'),
      openformula: '',
    });
    expect(inEach('=LEN("😀")')).toEqual({ google: 2, ooxml: 2, openformula: 1 });
  });

  it('DECIMAL with a leading 0x only in OpenFormula’s', () => {
    expect(inEach('=DECIMAL("0x1F", 16)')).toEqual({
      google: error('#NUM!'),
      ooxml: error('#NUM!'),
      openformula: 31,
    });
  });

  it('SUMPRODUCT reads TRUE and a number typed as text, but OOXML’s reads them as 0', () => {
    const cells = { A1: 'TRUE', B1: '2', A2: "'5", B2: '3', A3: 'x', B3: '4' };
    expect(inEach('=SUMPRODUCT(A1:A3, B1:B3)', cells)).toEqual({
      google: 17,
      ooxml: 0,
      openformula: 17,
    });
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

  it('CUMIPMT and CUMPRINC: OOXML truncates the periods (Financial CUMIPMT.4, CUMPRINC.4)', () => {
    const args = '0.0075, 360, 125000';
    const interest = calc(`=CUMIPMT(${args}, 3, 4, 0)`);
    expect(inEach(`=CUMIPMT(${args}, 2.1, 4.9, 0)`)).toEqual({
      google: interest,
      ooxml: calc(`=CUMIPMT(${args}, 2, 4, 0)`),
      openformula: interest,
    });
    const principal = expect.closeTo(-278.4805091603324, 9) as unknown;
    expect(inEach(`=CUMPRINC(${args}, 2.1, 4.9, 0)`)).toEqual({
      google: principal,
      ooxml: calc(`=CUMPRINC(${args}, 2, 4, 0)`),
      openformula: principal,
    });
  });

  it('day counts: Google’s against OpenFormula’s procedures (Financial ACCRINT.1, COUPDAYBS.20, PRICEMAT.2)', () => {
    const close = (v: number): unknown => expect.closeTo(v, 9);
    expect(
      inEach('=ACCRINT(DATE(2010,1,1), DATE(2010,2,1), DATE(2012,12,31), 0.05, 100, 4)'),
    ).toEqual({
      google: close(14.98611111111111),
      ooxml: close(14.98611111111111),
      openformula: close(15),
    });
    expect(
      inEach('=ACCRINT(DATE(2008,3,1), DATE(2008,8,31), DATE(2008,5,1), 0.1, 1000, 2, 1)'),
    ).toEqual({
      google: close(16.57608695652174),
      ooxml: close(16.57608695652174),
      openformula: close(1000 * 0.1 * (61 / 366)),
    });
    expect(inEach('=COUPDAYBS(DATE(2011,2,28), DATE(2015,8,31), 2, 0)')).toEqual({
      google: -2,
      ooxml: -2,
      openformula: 0,
    });
    expect(inEach('=COUPDAYSNC(DATE(2011,2,28), DATE(2015,8,31), 2, 0)')).toEqual({
      google: 182,
      ooxml: 182,
      openformula: 181,
    });
    expect(
      calc('=COUPDAYSNC(DATE(2011,3,10), DATE(2015,8,31), 2, 4)', {}, { meaning: 'openformula' }),
    ).toBe(170);
    const pricemat = inEach(
      '=PRICEMAT(DATE(2008,2,15), DATE(2008,4,13), DATE(2007,11,11), 0.061, 0.061, 1)',
    );
    expect(pricemat).toEqual({
      google: close(99.984659117119),
      ooxml: close(99.984659117119),
      openformula: close(99.9802978513638),
    });
    expect(calc('=INTRATE(DATE(2008,2,29), DATE(2009,2,28), 1000000, 1014420)')).toBeCloseTo(
      0.01442,
      12,
    );
    expect(
      calc('=DISC(DATE(2007,2,16), DATE(2009,3,1), 97, 100, 1)', {}, { meaning: 'openformula' }),
    ).not.toBe(calc('=DISC(DATE(2007,2,16), DATE(2009,3,1), 97, 100, 1)'));
  });

  it('depreciation: the standards’ periods and rates (Financial DB.4, DDB.11, VDB.9)', () => {
    expect(inEach('=DB(1000000, 100000, 6, 7, 7)')).toEqual({
      google: error('#NUM!'),
      ooxml: expect.closeTo(15845.0984738481, 6) as unknown,
      openformula: expect.closeTo(15845.0984738481, 6) as unknown,
    });
    expect(inEach('=DDB(2400, 300, 2, 2, 3)')).toEqual({ google: -1800, ooxml: 0, openformula: 0 });
    const vdb = inEach('=VDB(2400, 300, 10, 1.5, 4.25)');
    expect(vdb.google).toBeCloseTo(787.968, 9);
    expect(vdb.ooxml).toBeCloseTo(787.968, 9);
    expect(vdb.openformula).toBeCloseTo(794.112, 9);
  });

  it('EFFECT of 0 and FVSCHEDULE over text: OpenFormula takes them (Financial EFFECT.4, FVSCHEDULE.3)', () => {
    expect(inEach('=EFFECT(0, 4)')).toEqual({
      google: error('#NUM!'),
      ooxml: error('#NUM!'),
      openformula: 0,
    });
    const cells = { A1: '0.1', A2: 'x', A3: '' };
    expect(inEach('=FVSCHEDULE(100, A1:A3)', cells)).toEqual({
      google: error('#VALUE!'),
      ooxml: error('#VALUE!'),
      openformula: expect.closeTo(110, 9) as unknown,
    });
  });

  it('the A forms with typed text: OpenFormula reads it as 0 (Statistical AVERAGEA.4, MINA.4, VARPA.4)', () => {
    for (const [name, value] of [
      ['AVERAGEA', 0.5],
      ['MINA', 0],
      ['STDEVA', Math.SQRT1_2],
      ['STDEVPA', 0.5],
      ['VARA', 0.5],
      ['VARPA', 0.25],
    ] as const)
      expect(inEach(`=${name}(1, "x")`)).toEqual({
        google: error('#VALUE!'),
        ooxml: error('#VALUE!'),
        openformula: expect.closeTo(value, 12) as unknown,
      });
  });

  it('OpenFormula’s ends Google refuses (Statistical BETAINV.4, CRITBINOM.3, EXPONDIST.3, GEOMEAN.3)', () => {
    for (const [formula, value] of [
      ['=BETAINV(0, 3, 2)', 0],
      ['=BETADIST(2, 3, 8)', 1],
      ['=BETADIST(-1, 3, 8)', 0],
      ['=BETADIST(2, 3, 8, 0, 1, FALSE)', 0],
      ['=CRITBINOM(10, 0.5, 0)', 0],
      ['=CRITBINOM(10, 0.5, 1)', 10],
      ['=CRITBINOM(10, 0, 0.5)', 0],
      ['=EXPONDIST(-1, 0.5, TRUE)', 0],
      ['=GEOMEAN(2, 0)', 0],
      ['=LOGNORMDIST(0, 4, 6)', 0],
    ] as const)
      expect(inEach(formula)).toEqual({
        google: error('#NUM!'),
        ooxml: error('#NUM!'),
        openformula: value,
      });
    // Excel's names answer as Excel's in an ODF file too.
    for (const formula of [
      '=BETA.INV(0, 3, 2)',
      '=BINOM.INV(10, 0.5, 0)',
      '=EXPON.DIST(-1, 0.5, TRUE)',
    ])
      expect(calc(formula, {}, { meaning: 'openformula' })).toEqual(error('#NUM!'));
  });

  it('HYPGEOMDIST of a fraction: Excel truncates every count first (Statistical HYPGEOMDIST.6, HYPGEOM.DIST.6)', () => {
    const google = 0.06722646322201385;
    const truncated = 0.109243002735772;
    const close = (v: number): unknown => expect.closeTo(v, 12);
    expect(inEach('=HYPGEOMDIST(4.9, 12, 20, 40)')).toEqual({
      google: close(google),
      ooxml: close(truncated),
      openformula: close(google),
    });
    expect(inEach('=HYPGEOM.DIST(4.9, 12, 20, 40, FALSE)')).toEqual({
      google: close(google),
      ooxml: close(truncated),
      openformula: close(truncated),
    });
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

  it('PERMUTATIONA: n^k for any n and k from 0 in both standards (Statistical PERMUTATIONA.3, .6)', () => {
    expect(inEach('=PERMUTATIONA(0, 2)')).toEqual({
      google: error('#NUM!'),
      ooxml: 0,
      openformula: 0,
    });
    expect(inEach('=PERMUTATIONA(3, 0)')).toEqual({
      google: error('#NUM!'),
      ooxml: 1,
      openformula: 1,
    });
    expect(inEach('=PERMUTATIONA(3, 4)')).toEqual({ google: 81, ooxml: 81, openformula: 81 });
    expect(calc('=PERMUTATIONA(0, 0)', {}, { meaning: 'ooxml' })).toBe(1);
    expect(calc('=PERMUTATIONA(-1, 2)', {}, { meaning: 'ooxml' })).toEqual(error('#NUM!'));
  });
});
