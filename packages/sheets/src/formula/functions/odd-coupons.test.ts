import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';
import { wholeQuasiPeriods } from './odd-coupons';
import { serialFromDate } from '../../dates';

// The odd-period bonds' sums the oracle corpus (oracle/cases/OpenFormula.json) cannot hold: LibreOffice leaves
// ODDFPRICE and ODDFYIELD unbuilt and counts an odd last period as one span. Each answer is Excel's, as
// formulas.md "Functions": Finance has the odd periods follow it (D59).
const near = (formula: string, want: number) =>
  expect(calc(formula, {}) as number).toBeCloseTo(want, 8);
const errorOf = (formula: string) => (calc(formula, {}) as { e?: string }).e;

describe('the odd first period', () => {
  it('cuts a long first period into quasi-coupon periods of their actual lengths', () => {
    near(
      '=ODDFPRICE(DATE(2001,5,14), DATE(2003,5,14), DATE(1998,2,28), DATE(2002,5,14), 0.07, 0.03, 100, 2, 1)',
      106.9991577059,
    );
  });

  it("counts settlement's month end as a whole period when the first coupon is a month's last day", () => {
    near(
      '=ODDFPRICE(DATE(1978,5,4), DATE(2010,6,30), DATE(1977,5,4), DATE(2009,6,30), 0.07, 0.03, 100, 4, 0)',
      121.6958967467,
    );
    near(
      '=ODDFPRICE(DATE(1993,11,30), DATE(1995,11,30), DATE(1992,11,30), DATE(1994,11,30), 0.07, 0.03, 100, 4, 4)',
      107.4159346639,
    );
  });

  it('counts an end on the 31st as the 30th after a start on the 30th or 31st on US 30/360', () => {
    near(
      '=ODDFPRICE(DATE(1999,2,28), DATE(2004,3,31), DATE(1998,2,28), DATE(2003,3,31), 0.07, 0.03, 100, 4, 0)',
      116.4996451183,
    );
  });

  it('counts February 29 as the 30th on US 30/360', () => {
    near(
      '=ODDFPRICE(DATE(1999,2,28), DATE(2008,2,29), DATE(1998,2,28), DATE(2000,2,29), 0.07, 0.03, 67, 2, 0)',
      105.8478528572,
    );
  });

  it("steps on months' last days from a settlement on one when the first coupon is a longer month's 30th", () => {
    const quarters = (d: number) =>
      wholeQuasiPeriods(serialFromDate(2000, 2, d), serialFromDate(2009, 5, 30), 3);
    expect(quarters(29)).toBe(36);
    expect(quarters(28)).toBe(37);
  });

  it('refuses a yield that no price reaches', () => {
    expect(
      errorOf(
        '=ODDFYIELD(DATE(2008,11,11), DATE(2021,3,1), DATE(2008,10,15), DATE(2009,3,1), 0.0575, 1E+300, 100, 2)',
      ),
    ).toBe('#NUM!');
  });
});

describe('the odd last period', () => {
  it('cuts a long last period into quasi-coupon periods forward from the last interest date', () => {
    near(
      '=ODDLPRICE(DATE(1993,11,30), DATE(2010,6,5), DATE(1977,5,4), 0.07, 0.03, 100, 4, 1)',
      105.7447232225,
    );
    near(
      '=ODDLYIELD(DATE(1993,11,30), DATE(2010,6,5), DATE(1977,5,4), 0.07, 100, 67, 4, 3)',
      0.02315787125768,
    );
  });

  it("counts every period's end on the 31st or February's last day as the 30th on US 30/360", () => {
    near(
      '=ODDLPRICE(DATE(1993,11,30), DATE(2004,3,31), DATE(1992,11,30), 0.07, 0.03, 100, 4, 0)',
      130.0146809623,
    );
    near(
      '=ODDLPRICE(DATE(1993,11,30), DATE(2008,2,29), DATE(1992,11,30), 0.07, 0.03, 100, 2, 0)',
      137.8420806819,
    );
  });

  it('refuses a day count convention outside 0 to 4', () => {
    expect(
      errorOf(
        '=ODDLPRICE(DATE(2008,2,7), DATE(2008,6,15), DATE(2007,10,15), 0.0375, 0.0405, 100, 2, 5)',
      ),
    ).toBe('#NUM!');
  });
});
