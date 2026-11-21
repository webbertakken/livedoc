// Coupon functions (docs/specs/029-sheets/formulas.md "Functions": Finance): the coupon dates of a security around
// its settlement, counted back from maturity in steps of 12 / frequency months. A maturity on a month's last day puts
// every coupon on a month's last day; any other keeps its day, or the month's last when the month is shorter.
import { dateFromSerial, serialFromDate } from '../../dates';
import type { FnDef } from '../fn';
import type { FormulaMeaning } from '../meaning';
import { err, isError, type SheetError } from '../values';
import {
  basisOf,
  couponDayDiff,
  days360,
  daysInMonth,
  frequencyOf,
  isLastOfMonth,
  usDays360,
} from './day-count';
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

// Google counts US 30/360 days by DAYS360 (a period from 28 February to settlement that day is -2 days), and the days
// to the next coupon as the period's less those before settlement; European ones directly (measured). OpenFormula
// counts both by its procedure A (Part 4 §4.11.7.3; the file's meaning).

/** The days from the period's start to settlement. */
export function daysFromCoupon(c: Coupons, meaning: FormulaMeaning = 'google'): number {
  if (meaning === 'openformula' && c.basis === 0) return usDays360(c.previous, c.settlement);
  return couponDayDiff(c.previous, c.settlement, c.basis);
}

/** The days from settlement to the next coupon. */
export function daysToCoupon(c: Coupons, meaning: FormulaMeaning = 'google'): number {
  if (c.basis === 0)
    return meaning === 'openformula'
      ? usDays360(c.settlement, c.next)
      : couponDays(c) - daysFromCoupon(c);
  if (c.basis === 4) return days360(c.settlement, c.next, true);
  return c.next - c.settlement;
}

function couponFn(read: (c: Coupons, meaning: FormulaMeaning) => number): FnDef {
  return financeFn(3, 4, [0, 1], ([settlement, maturity, frequency, basis = 0], f) => {
    const c = couponsOf(settlement!, maturity!, frequency!, basis);
    return isError(c) ? c : read(c, f.meaning);
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
