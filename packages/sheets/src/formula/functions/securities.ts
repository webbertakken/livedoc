// Securities paying interest (docs/specs/029-sheets/formulas.md "Functions": Finance): a coupon bond's price, yield
// and duration (PRICE, YIELD, DURATION, MDURATION), interest paid at maturity (PRICEMAT, YIELDMAT) and the interest
// accrued since issue (ACCRINT, ACCRINTM). Prices are per 100 of face value; rates are annual.
import type { FnDef } from '../fn';
import { err, isError } from '../values';
import { couponDays, couponsOf, daysFromCoupon, daysToCoupon, type Coupons } from './coupons';
import { accrualYears, basisOf, frequencyOf, yearFrac } from './day-count';
import { financeFn } from './finance-args';
import { bisectFalling } from './solve';

// The price of 100 face value: each coupon and the redemption discounted from settlement, less the interest accrued.
function price(c: Coupons, rate: number, yld: number, redemption: number): number {
  const f = c.frequency;
  const days = couponDays(c);
  const toNext = daysToCoupon(c) / days;
  const coupon = (100 * rate) / f;
  let value =
    redemption / (1 + yld / f) ** (c.count - 1 + toNext) - (coupon * daysFromCoupon(c)) / days;
  for (let k = 0; k < c.count; k++) value += coupon / (1 + yld / f) ** (k + toNext);
  return value;
}

// Macaulay duration in years: the coupons' times, weighted by their discounted values.
function duration(c: Coupons, maturity: number, rate: number, yld: number): number {
  const f = c.frequency;
  const coupon = (100 * rate) / f;
  const growth = 1 + yld / f;
  const shift = yearFrac(c.settlement, maturity, c.basis) * f - c.count;
  let weighted = 0;
  let value = 0;
  for (let t = 1; t <= c.count; t++) {
    const flow = t === c.count ? coupon + 100 : coupon;
    const discounted = flow / growth ** (t + shift);
    weighted += (t + shift) * discounted;
    value += discounted;
  }
  return weighted / value / f;
}

function durationFn(modified: boolean): FnDef {
  return financeFn(5, 6, [0, 1], ([settlement, maturity, rate, yld, frequency, basis = 0]) => {
    if (rate! < 0 || yld! < 0) return err('#NUM!', 'The rate and yield are not negative');
    const c = couponsOf(settlement!, maturity!, frequency!, basis);
    if (isError(c)) return c;
    const d = duration(c, maturity!, rate!, yld!);
    return modified ? d / (1 + yld! / c.frequency) : d;
  });
}

export const SECURITY_FUNCTIONS: Record<string, FnDef> = {
  PRICE: financeFn(
    6,
    7,
    [0, 1],
    ([settlement, maturity, rate, yld, redemption, frequency, basis = 0]) => {
      if (rate! < 0 || yld! < 0 || redemption! <= 0)
        return err('#NUM!', 'The rate and yield are not negative, and the redemption is positive');
      const c = couponsOf(settlement!, maturity!, frequency!, basis);
      return isError(c) ? c : price(c, rate!, yld!, redemption!);
    },
  ),
  YIELD: financeFn(
    6,
    7,
    [0, 1],
    ([settlement, maturity, rate, pr, redemption, frequency, basis = 0]) => {
      if (rate! < 0 || pr! <= 0 || redemption! <= 0)
        return err('#NUM!', 'The rate is not negative, and the price and redemption are positive');
      const c = couponsOf(settlement!, maturity!, frequency!, basis);
      if (isError(c)) return c;
      const y = bisectFalling(
        (x) => price(c, rate!, x, redemption!) - pr!,
        -c.frequency * 0.999,
        1,
      );
      return y ?? err('#NUM!', 'YIELD did not settle');
    },
  ),
  DURATION: durationFn(false),
  MDURATION: durationFn(true),
  ACCRINT: financeFn(6, 8, [0, 1, 2], ([issue, , settlement, rate, par, frequency, b = 0]) => {
    const f = frequencyOf(frequency!);
    if (isError(f)) return f;
    const basis = basisOf(b);
    if (isError(basis)) return basis;
    if (rate! <= 0 || par! <= 0) return err('#NUM!', 'The rate and redemption are positive');
    if (issue! >= settlement!) return err('#NUM!', 'Issue is before settlement');
    return par! * rate! * accrualYears(issue!, settlement!, basis);
  }),
  ACCRINTM: financeFn(3, 5, [0, 1], ([issue, maturity, rate, par = 1000, b = 0]) => {
    const basis = basisOf(b);
    if (isError(basis)) return basis;
    if (rate! <= 0 || par <= 0) return err('#NUM!', 'The rate and redemption are positive');
    if (issue! >= maturity!) return err('#NUM!', 'Issue is before maturity');
    return par * rate! * accrualYears(issue!, maturity!, basis);
  }),
  PRICEMAT: financeFn(5, 6, [0, 1, 2], ([settlement, maturity, issue, rate, yld, b = 0]) => {
    const basis = basisOf(b);
    if (isError(basis)) return basis;
    if (rate! < 0 || yld! < 0) return err('#NUM!', 'The rate and yield are not negative');
    if (settlement! >= maturity!) return err('#NUM!', 'Settlement is before maturity');
    const issueToMaturity = yearFrac(issue!, maturity!, basis);
    const issueToSettlement = yearFrac(issue!, settlement!, basis);
    const settlementToMaturity = yearFrac(settlement!, maturity!, basis);
    return (
      100 *
      ((1 + issueToMaturity * rate!) / (1 + settlementToMaturity * yld!) -
        issueToSettlement * rate!)
    );
  }),
  YIELDMAT: financeFn(5, 6, [0, 1, 2], ([settlement, maturity, issue, rate, pr, b = 0]) => {
    const basis = basisOf(b);
    if (isError(basis)) return basis;
    if (rate! < 0 || pr! <= 0)
      return err('#NUM!', 'The rate is not negative and the price positive');
    if (settlement! >= maturity! || settlement! < issue!)
      return err('#NUM!', 'Settlement is from issue to before maturity');
    const issueToMaturity = yearFrac(issue!, maturity!, basis);
    const issueToSettlement = yearFrac(issue!, settlement!, basis);
    const settlementToMaturity = yearFrac(settlement!, maturity!, basis);
    return (
      ((1 + issueToMaturity * rate!) / (pr! / 100 + issueToSettlement * rate!) - 1) /
      settlementToMaturity
    );
  }),
};
