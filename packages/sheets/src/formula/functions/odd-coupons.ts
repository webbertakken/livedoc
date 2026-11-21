// Securities with an odd first or last coupon period (docs/specs/029-sheets/formulas.md "Functions": Finance):
// ODDFPRICE, ODDFYIELD, ODDLPRICE and ODDLYIELD. The odd period is cut into quasi-coupon periods, the regular
// periods it would hold were it regular; each counts by its share of a regular period. Prices are per 100 of face
// value; rates are annual. The sums are Excel's (ECMA-376 Part 1 §18.17.7), which OpenFormula names but leaves open.
import { dateFromSerial, serialFromDate } from '../../dates';
import type { FnDef } from '../fn';
import { err, isError, type SheetError } from '../values';
import { couponDays, couponsOf, daysToCoupon, type Coupons } from './coupons';
import { basisOf, daysInMonth, frequencyOf, isLastOfMonth } from './day-count';
import { financeFn } from './finance-args';
import { bisectFalling } from './solve';

/** The date `months` on (or back), its day kept or, in a shorter month, that month's last. */
function addMonths(serial: number, months: number): number {
  const p = dateFromSerial(serial);
  const at = p.y * 12 + p.m - 1 + months;
  const y = Math.floor(at / 12);
  const m = (at % 12) + 1;
  return serialFromDate(y, m, Math.min(p.d, daysInMonth(y, m)));
}

// The days from `a` to `b` by the convention, none when `b` is not after `a`. US 30/360 counts a start on a month's
// last day as the 30th and an end on the 31st as the 30th after a start on the 30th or 31st; with `bothEnds` (the
// odd last period's lengths) an end on the 31st or on February's last day counts as the 30th whatever the start.
function daysBetween(a: number, b: number, basis: number, bothEnds = false): number {
  if (basis !== 0 && basis !== 4) return Math.max(0, b - a);
  const pa = dateFromSerial(a);
  const pb = dateFromSerial(b);
  let d1 = pa.d;
  let d2 = pb.d;
  if (basis === 4) {
    d1 = Math.min(d1, 30);
    d2 = Math.min(d2, 30);
  } else {
    const startLast = isLastOfMonth(pa) && (pa.m === 2 || d1 === 31);
    if (pb.m === 2 && isLastOfMonth(pb) && (bothEnds || (pa.m === 2 && startLast))) d2 = 30;
    if (d2 === 31 && (d1 >= 30 || bothEnds)) d2 = 30;
    if (startLast) d1 = 30;
  }
  return Math.max(0, (pb.y - pa.y) * 360 + (pb.m - pa.m) * 30 + d2 - d1);
}

// The whole quasi-coupon periods from settlement to the first coupon, as Excel counts them: steps of a period from
// settlement while before the first coupon. When the first coupon is a month's last day, the steps run on months' last
// days from the end of settlement's month, and moving settlement there counts one more.
export function wholeQuasiPeriods(settlement: number, first: number, months: number): number {
  const p = dateFromSerial(first);
  const s = dateFromSerial(settlement);
  const endOfMonth =
    !isLastOfMonth(p) && p.m !== 2 && p.d > 28 ? isLastOfMonth(s) : isLastOfMonth(p);
  const step = (serial: number) => {
    if (!endOfMonth) return addMonths(serial, months);
    const q = dateFromSerial(addMonths(serial, months));
    return serialFromDate(q.y, q.m, daysInMonth(q.y, q.m));
  };
  const start = endOfMonth ? serialFromDate(s.y, s.m, daysInMonth(s.y, s.m)) : settlement;
  let count = start > settlement ? 1 : 0;
  for (let at = step(start); at < first; at = step(at)) count++;
  return count;
}

/** An odd first period: the bond from settlement, its regular schedule running from `first` to maturity. */
type OddFirst = {
  settlement: number;
  maturity: number;
  issue: number;
  first: number;
  rate: number;
  redemption: number;
  frequency: number;
  basis: number;
};

// The price of 100 face value at `yld`: the odd first coupon (its quasi-coupon shares), the regular coupons and the
// redemption discounted from settlement, less the interest accrued from issue.
function oddFirstPrice(b: OddFirst, yld: number): number {
  const f = b.frequency;
  const coupon = (100 * b.rate) / f;
  const growth = 1 + yld / f;
  const around = couponsOf(b.settlement, b.first, f, b.basis) as Coupons;
  const e = couponDays(around);
  const regular = (couponsOf(b.first, b.maturity, f, b.basis) as Coupons).count;
  const fromIssue = daysBetween(b.issue, b.first, b.basis);
  if (fromIssue < e) {
    const n = (couponsOf(b.settlement, b.maturity, f, b.basis) as Coupons).count;
    const toFirst = daysBetween(b.settlement, b.first, b.basis) / e;
    let value =
      b.redemption / growth ** (n - 1 + toFirst) +
      (coupon * fromIssue) / e / growth ** toFirst -
      (coupon * daysBetween(b.issue, b.settlement, b.basis)) / e;
    for (let k = 2; k <= n; k++) value += coupon / growth ** (k - 1 + toFirst);
    return value;
  }
  // A long first period: its quasi-coupon periods back from the first coupon, the earliest holding the issue date.
  const quasi = (couponsOf(b.issue, b.first, f, b.basis) as Coupons).count;
  let counted = 0;
  let accrued = 0;
  let late = b.first;
  for (let i = quasi; i >= 1; i--) {
    const early = addMonths(late, -12 / f);
    const length = b.basis === 1 ? daysBetween(early, late, b.basis) : e;
    counted += (i > 1 ? length : daysBetween(b.issue, late, b.basis)) / length;
    accrued +=
      daysBetween(Math.max(b.issue, early), Math.min(b.settlement, late), b.basis) / length;
    late = early;
  }
  const toNext = daysToCoupon(around) / e;
  const whole = wholeQuasiPeriods(b.settlement, b.first, 12 / f);
  let value =
    b.redemption / growth ** (toNext + whole + regular) +
    (coupon * counted) / growth ** (whole + toNext) -
    coupon * accrued;
  for (let k = 1; k <= regular; k++) value += coupon / growth ** (k + whole + toNext);
  return value;
}

/** The bond, or `#NUM!` when the dates are not maturity > first > settlement > issue or an argument is out of range. */
function oddFirstOf(ns: number[]): OddFirst | SheetError {
  const [settlement, maturity, issue, first, rate, , redemption, frequencyArg, basisArg = 0] =
    ns as [number, number, number, number, number, number, number, number, number?];
  const frequency = frequencyOf(frequencyArg);
  if (isError(frequency)) return frequency;
  const basis = basisOf(basisArg);
  if (isError(basis)) return basis;
  if (!(maturity > first && first > settlement && settlement > issue))
    return err('#NUM!', 'The dates run issue, settlement, first coupon, maturity');
  if (rate <= 0 || redemption <= 0) return err('#NUM!', 'The rate and redemption are positive');
  return { settlement, maturity, issue, first, rate, redemption, frequency, basis };
}

/** An odd last period's sums over its quasi-coupon periods, forward from the last interest date. */
type OddLast = {
  coupon: number;
  redemption: number;
  frequency: number;
  counted: number;
  accrued: number;
  toEnd: number;
};

function oddLastOf(ns: number[]): OddLast | SheetError {
  const [settlement, maturity, last, rate, , redemption, frequencyArg, basisArg = 0] = ns as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number?,
  ];
  const frequency = frequencyOf(frequencyArg);
  if (isError(frequency)) return frequency;
  const basis = basisOf(basisArg);
  if (isError(basis)) return basis;
  if (!(maturity > settlement && settlement > last))
    return err('#NUM!', 'The dates run last interest, settlement, maturity');
  if (rate <= 0 || redemption <= 0) return err('#NUM!', 'The rate and redemption are positive');
  const quasi = (couponsOf(last, maturity, frequency, basis) as Coupons).count;
  const sums = {
    coupon: (100 * rate) / frequency,
    redemption,
    frequency,
    counted: 0,
    accrued: 0,
    toEnd: 0,
  };
  let early = last;
  for (let i = 1; i <= quasi; i++) {
    const late = addMonths(early, 12 / frequency);
    const length = daysBetween(early, late, basis, true);
    const counted = i < quasi ? length : daysBetween(early, maturity, basis, true);
    const accrued =
      late < settlement ? counted : early < settlement ? daysBetween(early, settlement, basis) : 0;
    sums.counted += counted / length;
    sums.accrued += accrued / length;
    sums.toEnd +=
      daysBetween(Math.max(settlement, early), Math.min(maturity, late), basis) / length;
    early = late;
  }
  return sums;
}

export const ODD_COUPON_FUNCTIONS: Record<string, FnDef> = {
  ODDFPRICE: financeFn(8, 9, [0, 1, 2, 3], (ns) => {
    const b = oddFirstOf(ns);
    if (isError(b)) return b;
    if (ns[5]! < 0) return err('#NUM!', 'The yield is not negative');
    return oddFirstPrice(b, ns[5]!);
  }),
  ODDFYIELD: financeFn(8, 9, [0, 1, 2, 3], (ns) => {
    const b = oddFirstOf(ns);
    if (isError(b)) return b;
    const price = ns[5]!;
    if (price <= 0) return err('#NUM!', 'The price is positive');
    const y = bisectFalling((x) => oddFirstPrice(b, x) - price, -b.frequency * 0.999, 1);
    return y ?? err('#NUM!', 'ODDFYIELD did not settle');
  }),
  ODDLPRICE: financeFn(7, 8, [0, 1, 2], (ns) => {
    const s = oddLastOf(ns);
    if (isError(s)) return s;
    const yld = ns[4]!;
    if (yld < 0) return err('#NUM!', 'The yield is not negative');
    return (
      (s.redemption + s.counted * s.coupon) / (1 + (s.toEnd * yld) / s.frequency) -
      s.accrued * s.coupon
    );
  }),
  ODDLYIELD: financeFn(7, 8, [0, 1, 2], (ns) => {
    const s = oddLastOf(ns);
    if (isError(s)) return s;
    const price = ns[4]!;
    if (price <= 0) return err('#NUM!', 'The price is positive');
    const paid = price + s.accrued * s.coupon;
    return ((s.redemption + s.counted * s.coupon - paid) / paid) * (s.frequency / s.toEnd);
  }),
};
