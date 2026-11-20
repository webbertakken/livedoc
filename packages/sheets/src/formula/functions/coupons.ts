// Coupon functions (docs/specs/029-sheets/formulas.md "Functions": Finance): the coupon dates of a security around
// its settlement, counted back from maturity in steps of 12 / frequency months. A maturity on a month's last day puts
// every coupon on a month's last day; any other keeps its day, or the month's last when the month is shorter.
import { dateFromSerial, serialFromDate } from '../../dates';
import type { FnDef } from '../fn';
import { err, isError, type SheetError } from '../values';
import { basisOf, couponDayDiff, daysInMonth, frequencyOf, isLastOfMonth } from './day-count';
import { financeFn } from './finance-args';

/** A security's coupon schedule around its settlement date. */
export type Coupons = {
  settlement: number;
  frequency: number;
  basis: number;
  /** The last coupon date on or before settlement. */
  previous: number;
  /** The first coupon date after settlement. */
  next: number;
  /** The coupons from settlement to maturity. */
  count: number;
};

/** The schedule, or `#NUM!` when settlement is not before maturity or the frequency or convention is not one. */
export function couponsOf(
  settlement: number,
  maturity: number,
  frequencyArg: number,
  basisArg: number,
): Coupons | SheetError {
  const frequency = frequencyOf(frequencyArg);
  if (isError(frequency)) return frequency;
  const basis = basisOf(basisArg);
  if (isError(basis)) return basis;
  if (settlement >= maturity) return err('#NUM!', 'Settlement is before maturity');
  const end = dateFromSerial(maturity);
  const endOfMonth = isLastOfMonth(end);
  const step = 12 / frequency;
  const back = (months: number) => {
    const at = end.y * 12 + end.m - 1 - months;
    const y = Math.floor(at / 12);
    const m = (at % 12) + 1;
    const last = daysInMonth(y, m);
    return serialFromDate(y, m, endOfMonth ? last : Math.min(end.d, last));
  };
  // From the coupon in or after settlement's month, back one step at a time to the one on or before settlement.
  const start = dateFromSerial(settlement);
  let months = Math.floor(((end.y - start.y) * 12 + end.m - start.m) / step) * step;
  while (back(months) > settlement) months += step;
  return {
    settlement,
    frequency,
    basis,
    previous: back(months),
    next: back(months - step),
    count: months / step,
  };
}

/** The days of the coupon period settlement falls in. */
export function couponDays(c: Coupons): number {
  if (c.basis === 1) return c.next - c.previous;
  return (c.basis === 3 ? 365 : 360) / c.frequency;
}

/** The days from the period's start to settlement. */
export const daysFromCoupon = (c: Coupons) => couponDayDiff(c.previous, c.settlement, c.basis);

/** The days from settlement to the next coupon; on 30/360, the period's days less those before settlement. */
export function daysToCoupon(c: Coupons): number {
  if (c.basis === 0 || c.basis === 4) return couponDays(c) - daysFromCoupon(c);
  return c.next - c.settlement;
}

function couponFn(read: (c: Coupons) => number): FnDef {
  return financeFn(3, 4, [0, 1], ([settlement, maturity, frequency, basis = 0]) => {
    const c = couponsOf(settlement!, maturity!, frequency!, basis);
    return isError(c) ? c : read(c);
  });
}

export const COUPON_FUNCTIONS: Record<string, FnDef> = {
  COUPPCD: couponFn((c) => c.previous),
  COUPNCD: couponFn((c) => c.next),
  COUPNUM: couponFn((c) => c.count),
  COUPDAYS: couponFn(couponDays),
  COUPDAYBS: couponFn(daysFromCoupon),
  COUPDAYSNC: couponFn(daysToCoupon),
};
