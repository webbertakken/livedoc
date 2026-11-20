import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';
import { bisectFalling, solve } from './solve';

// The finance functions' guards and edges the oracle corpus (oracle/cases/Financial.json) leaves out; each cites the
// formulas.md "Functions": Finance rule it holds.
const errorOf = (formula: string, cells: Record<string, string> = {}) =>
  (calc(formula, cells) as { e?: string }).e;

describe('the finance functions', () => {
  it('reads a date typed as text that is no date as an error', () => {
    expect(errorOf('=COUPNUM("soon", DATE(2020,1,1), 2)')).toBe('#VALUE!');
  });

  it('refuses a day count convention outside 0 to 4', () => {
    for (const f of [
      '=ACCRINTM(DATE(2008,4,1), DATE(2008,6,15), 0.1, 1000, 5)',
      '=PRICEMAT(DATE(2008,2,15), DATE(2008,4,13), DATE(2007,11,11), 0.06, 0.06, 5)',
      '=YIELDMAT(DATE(2008,2,15), DATE(2008,4,13), DATE(2007,11,11), 0.06, 99, 5)',
      '=DISC(DATE(2008,2,15), DATE(2008,4,13), 99, 100, 5)',
      '=AMORLINC(2400, DATE(2008,8,19), DATE(2008,12,31), 300, 1, 0.15, 5)',
      '=YEARFRAC(DATE(2008,2,15), DATE(2008,4,13), 5)',
    ])
      expect(errorOf(f), f).toBe('#NUM!');
  });

  it('refuses a coupon bond whose settlement is not before maturity', () => {
    expect(errorOf('=PRICE(DATE(2018,2,15), DATE(2017,11,15), 0.0575, 0.065, 100, 2)')).toBe(
      '#NUM!',
    );
  });

  it('gives #NUM! for a price no yield reaches', () => {
    expect(errorOf('=YIELD(DATE(2008,2,15), DATE(2016,11,15), 0.0575, 1E300, 100, 2)')).toBe(
      '#NUM!',
    );
  });

  it('passes an argument error on', () => {
    for (const f of ['=DAYS360(1/0, 2)', '=DAYS360(1, 1/0)', '=DAYS360(1, 2, 1/0)'])
      expect(errorOf(f), f).toBe('#DIV/0!');
  });

  it('settles RATE at a guess of 0 when nothing is earned', () => {
    expect(calc('=RATE(10, -100, 1000, 0, 0, 0)')).toBe(0);
  });
});

describe('the cash flow functions', () => {
  it('passes an error in the flows, rates or guess on', () => {
    const cells = { A1: '-100', A2: '=1/0', A3: '50' };
    for (const f of [
      '=IRR(A1:A3)',
      '=MIRR(A1:A3, 0.1, 0.1)',
      '=MIRR({-1, 2}, 1/0, 0.1)',
      '=MIRR({-1, 2}, 0.1, 1/0)',
      '=XNPV(1/0, {-1, 2}, {1, 2})',
      '=XNPV(0.1, A1:A3, {1, 2, 3})',
      '=XNPV(0.1, {-1, 2}, A1:A2)',
      '=XIRR({-1, 2}, {1, 400}, 1/0)',
      '=FVSCHEDULE(1/0, {0.1})',
      '=FVSCHEDULE(100, A1:A3)',
    ])
      expect(errorOf(f, cells), f).toBe('#DIV/0!');
  });

  it('gives #NUM! where a rate makes the value infinite or a guess is -100% or less', () => {
    for (const f of [
      '=MIRR({-1, 2, 3}, 0.1, -1)',
      '=XNPV(-1, {-1, 2}, {39448, 39813})',
      '=XIRR({-1, 2}, {39448, 39813}, -1)',
      '=FVSCHEDULE(1E308, {1, 1})',
    ])
      expect(errorOf(f), f).toBe('#NUM!');
  });

  it('gives #NUM! when IRR or XIRR does not settle', () => {
    expect(errorOf('=IRR({-1, 0, 0, 0, 1E-300})')).toBe('#NUM!');
    expect(errorOf('=XIRR({-1, 1E-300}, {39448, 39813})')).toBe('#NUM!');
  });
});

describe('root finding', () => {
  it('gives up when Newton flattens or overshoots to infinity', () => {
    expect(solve(() => 1, 0)).toBeNull();
    expect(solve((x) => (x === 0 ? 1 : Number.POSITIVE_INFINITY), 0)).toBeNull();
    expect(solve((x) => (x === 1e300 ? 1 : 1 + 2 ** -52), 1e300)).toBeNull();
  });

  it('bisects a falling function to its root, or finds no bracket', () => {
    expect(bisectFalling((x) => 2 - x, 0, 1)).toBeCloseTo(2, 12);
    expect(bisectFalling(() => 1, 0, 1)).toBeNull();
    expect(bisectFalling(() => -1, 0, 1)).toBeNull();
  });
});
