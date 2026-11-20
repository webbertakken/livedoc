// Depreciation functions (docs/specs/029-sheets/formulas.md "Functions": Finance): how much of an asset's cost one
// period writes off, straight-line (SLN, AMORLINC), by the sum of the years' digits (SYD) or on a declining balance
// (DB, DDB, VDB).
import { numFn, type FnDef } from '../fn';
import { err, isError } from '../values';
import { basisOf, yearFrac } from './day-count';
import { financeFn } from './finance-args';

// The double (or `factor`) declining balance write-off of period `period`, never taking the value below salvage.
function ddb(cost: number, salvage: number, life: number, period: number, factor: number): number {
  let rate = factor / life;
  let before: number;
  if (rate >= 1) {
    rate = 1;
    before = period === 1 ? cost : 0;
  } else before = cost * (1 - rate) ** (period - 1);
  const after = cost * (1 - rate) ** period;
  return Math.max(0, after < salvage ? before - salvage : before - after);
}

// The declining balance write-offs of the first `periods` periods (the last one a fraction when `periods` is),
// switching to straight-line over the `remaining` life once that writes off more.
function switchingSum(
  cost: number,
  salvage: number,
  life: number,
  remaining: number,
  periods: number,
  factor: number,
): number {
  const last = Math.ceil(periods);
  let left = cost - salvage;
  let straight = 0;
  let onStraight = false;
  let sum = 0;
  for (let i = 1; i <= last; i++) {
    let term: number;
    if (onStraight) term = straight;
    else {
      const declining = ddb(cost, salvage, life, i, factor);
      straight = left / (remaining - (i - 1));
      onStraight = straight > declining;
      term = onStraight ? straight : declining;
      if (!onStraight) left -= declining;
    }
    sum += i === last ? term * (periods + 1 - last) : term;
  }
  return sum;
}

function vdb(
  cost: number,
  salvage: number,
  life: number,
  start: number,
  end: number,
  factor: number,
  noSwitch: boolean,
): number {
  const firstWhole = Math.floor(start);
  const lastWhole = Math.ceil(end);
  if (noSwitch) {
    let sum = 0;
    for (let i = firstWhole + 1; i <= lastWhole; i++) {
      let term = ddb(cost, salvage, life, i, factor);
      if (i === firstWhole + 1) term *= Math.min(end, firstWhole + 1) - start;
      else if (i === lastWhole) term *= end + 1 - lastWhole;
      sum += term;
    }
    return sum;
  }
  // A fraction of a period at either end is taken off the whole periods around it.
  const valueAfter = (periods: number) =>
    cost - switchingSum(cost, salvage, life, life, periods, factor);
  let part = 0;
  if (start !== firstWhole)
    part +=
      (start - firstWhole) *
      switchingSum(valueAfter(firstWhole), salvage, life, life - firstWhole, 1, factor);
  if (end !== lastWhole)
    part +=
      (lastWhole - end) *
      switchingSum(valueAfter(lastWhole - 1), salvage, life, life - (lastWhole - 1), 1, factor);
  const whole = switchingSum(
    valueAfter(firstWhole),
    salvage,
    life,
    life - firstWhole,
    lastWhole - firstWhole,
    factor,
  );
  return whole - part;
}

// DB: the fixed rate rounded to three places; a first year of `months` months, and a last part year when it is short.
function db(cost: number, salvage: number, life: number, period: number, months: number): number {
  const rate = Math.round((1 - (salvage / cost) ** (1 / life)) * 1000) / 1000;
  const first = (cost * rate * months) / 12;
  if (Math.floor(period) === 1) return first;
  let written = first;
  let term = 0;
  for (let i = 2; i <= Math.floor(Math.min(life, period)); i++) {
    term = (cost - written) * rate;
    written += term;
  }
  return period > life ? ((cost - written) * rate * (12 - months)) / 12 : term;
}

export const DEPRECIATION_FUNCTIONS: Record<string, FnDef> = {
  SLN: numFn(3, 3, ([cost, salvage, life]) =>
    life === 0 ? err('#DIV/0!', 'The life is not 0') : (cost! - salvage!) / life!,
  ),
  SYD: numFn(
    4,
    4,
    ([cost, salvage, life, period]) =>
      ((cost! - salvage!) * (life! - period! + 1) * 2) / (life! * (life! + 1)),
  ),
  DDB: numFn(4, 5, ([cost, salvage, life, period, factor = 2]) =>
    cost! < 0 || salvage! < 0 || factor <= 0 || salvage! > cost! || period! < 1 || period! > life!
      ? err('#NUM!', 'The period is from 1 to the life, and the salvage from 0 to the cost')
      : ddb(cost!, salvage!, life!, period!, factor),
  ),
  DB: numFn(4, 5, ([cost, salvage, life, period, month = 12]) => {
    const months = Math.floor(month);
    if (months < 1 || months > 12) return err('#NUM!', 'The first year has 1 to 12 months');
    if (cost! <= 0 || salvage! < 0 || salvage! > cost! || life! <= 0 || life! > 1200)
      return err('#NUM!', 'The salvage is from 0 to the cost, and the life from 1 to 1200');
    if (period! <= 0 || period! > life! + 1) return err('#NUM!', 'The period is within the life');
    return db(cost!, salvage!, life!, period!, months);
  }),
  VDB: numFn(5, 7, ([cost, salvage, life, start, end, factor = 2, noSwitch = 0]) =>
    start! < 0 || end! < start! || end! > life! || cost! < 0 || salvage! > cost! || factor <= 0
      ? err('#NUM!', 'The periods run from 0 to the life, and the salvage is at most the cost')
      : vdb(cost!, salvage!, life!, start!, end!, factor, noSwitch !== 0),
  ),
  // AMORLINC: a first part period from purchase to its end, then whole periods at the rate until the cost less
  // salvage is written off. A period between 0 and 1 counts as 1, a larger fraction is dropped (Google's help).
  AMORLINC: financeFn(6, 7, [1, 2], ([cost, bought, firstEnd, salvage, period, rate, b = 0]) => {
    const basis = basisOf(b);
    if (isError(basis)) return basis;
    if (
      bought! > firstEnd! ||
      rate! <= 0 ||
      salvage! > cost! ||
      cost! <= 0 ||
      salvage! < 0 ||
      period! < 0
    )
      return err(
        '#NUM!',
        'The purchase is before the first period ends, and the rate and cost are positive',
      );
    const per = period! > 0 && period! < 1 ? 1 : Math.floor(period!);
    const full = cost! * rate!;
    const first = yearFrac(bought!, firstEnd!, basis) * full;
    const wholePeriods = Math.trunc((cost! - salvage! - first) / full);
    let amount = 0;
    if (per === 0) amount = first;
    else if (per <= wholePeriods) amount = full;
    else if (per === wholePeriods + 1) amount = cost! - salvage! - full * wholePeriods - first;
    return Math.max(0, amount);
  }),
};
