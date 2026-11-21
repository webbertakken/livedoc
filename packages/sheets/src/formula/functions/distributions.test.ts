// The distributions' and tests' edges the oracle corpus leaves out (docs/specs/029-sheets/formulas.md "Functions":
// Statistics): densities at 0, the far tails, and errors in the arguments.
import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';

const DATA = {
  A1: '1',
  A2: '2',
  A3: '4',
  A4: 'x',
  B1: '2',
  B2: '3',
  B3: '5',
  B4: '7',
  C1: '=NA()',
  C2: '5',
  E1: '5',
  E2: '5',
  E3: '5',
};

describe('the distributions', () => {
  it.each([
    ['=NORM.S.INV(1E-12)', -7.034483825369],
    ['=GAMMA(0.3)', 2.991568987687591],
    ['=GAMMA.DIST(0, 2, 2, TRUE)', 0],
    ['=F.DIST(0, 2, 4, FALSE)', 1],
    ['=F.DIST(0, 3, 4, FALSE)', 0],
    ['=WEIBULL(0, 2, 3, FALSE)', 0],
    ['=WEIBULL(0, 1, 4, FALSE)', 0.25],
    ['=BETADIST(-1, 3, 8)', 0],
    ['=BETADIST(2, 3, 8, 0, 1, FALSE)', 0],
    ['=BETA.INV(1, 3, 2, 1, 5)', 5],
    ['=CHISQ.INV.RT(1E-10, 2)', 46.051701859880914],
    ['=F.DIST.RT(F.INV.RT(0.9, 3, 4), 3, 4)', 0.9],
    ['=T.INV(0.7, 5)', 0.5594296444729486],
    ['=BINOM.INV(3, 0.5, 0.99)', 3],
    ['=HYPGEOM.DIST(2, 3, 4, 6, TRUE)', 0.8],
  ])('%s is %d', (formula, value) => {
    expect(calc(formula, DATA) as number).toBeCloseTo(value, 9);
  });

  it.each([
    ['=F.DIST(0, 1, 4, FALSE)', '#NUM!'],
    ['=WEIBULL(0, 0.5, 3, FALSE)', '#NUM!'],
    ['=BETA.DIST(0.5, 2, 2, TRUE, 1, 1)', '#NUM!'],
    ['=BETA.INV(-0.1, 3, 2)', '#NUM!'],
    ['=GAMMA.INV(1.2, 3, 2)', '#NUM!'],
    ['=CHISQ.DIST(1, 1E11, TRUE)', '#NUM!'],
    ['=TDIST(1, 2, 3)', '#NUM!'],
    ['=NEGBINOM.DIST(1, 0, 0.5)', '#NUM!'],
    ['=NEGBINOM.DIST(1, 2, 1.5)', '#NUM!'],
    ['=BINOM.INV(-1, 0.5, 0.5)', '#NUM!'],
    ['=BINOM.INV(3, 0.5, 2)', '#NUM!'],
    ['=POISSON(2, 0)', '#NUM!'],
    ['=HYPGEOM.DIST(-1, 3, 4, 6)', '#NUM!'],
  ])('%s is %s', (formula, code) => {
    expect(calc(formula, DATA)).toMatchObject({ e: code });
  });
});

describe('the tests and intervals', () => {
  it.each([
    ['=CHISQ.TEST({1, "x", 3}, {2, 2, 2})', 0.6065306597126332],
    ['=T.TEST(B1:B3, E1:E3, 2, 1)', 0.1993592309745645],
    ['=Z.TEST(A1:A3, 1, 2)', 0.12410653949496186],
  ])('%s is %d', (formula, value) => {
    expect(calc(formula, DATA) as number).toBeCloseTo(value, 9);
  });

  it.each([
    ['=CHISQ.TEST(C1:C2, A1:A2)', '#N/A'],
    ['=CHISQ.TEST({1}, {2})', '#NUM!'],
    ['=F.TEST(C1:C2, A1:A3)', '#N/A'],
    ['=F.TEST(A1:A3, C1:C2)', '#N/A'],
    ['=T.TEST({1, "x"}, {2, 3}, 2, 1)', '#DIV/0!'],
    ['=T.TEST(A1:A4, B1:B4, 2, 1)', '#DIV/0!'],
    ['=T.TEST({1}, {2, 3}, 2, 2)', '#DIV/0!'],
    ['=T.TEST(E1:E3, E1:E3, 2, 2)', '#DIV/0!'],
    ['=T.TEST(E1:E3, E1:E3, 2, 3)', '#DIV/0!'],
    ['=T.TEST(A1:A3, B1:B3, "x", 1)', '#VALUE!'],
    ['=T.TEST(A1:A3, B1:B3, 2, "x")', '#VALUE!'],
    ['=T.TEST(C1:C2, B1:B2, 2, 1)', '#N/A'],
    ['=Z.TEST(C1:C2, 1)', '#N/A'],
    ['=Z.TEST(A1:A3, "x")', '#VALUE!'],
    ['=Z.TEST(A1:A3, 1, "x")', '#VALUE!'],
    ['=Z.TEST(A4, 1)', '#N/A'],
    ['=MARGINOFERROR(C1:C2, 0.9)', '#N/A'],
    ['=MARGINOFERROR(A1:A3, "x")', '#VALUE!'],
    ['=MARGINOFERROR(A1, 0.9)', '#DIV/0!'],
  ])('%s is %s', (formula, code) => {
    expect(calc(formula, DATA)).toMatchObject({ e: code });
  });
});
