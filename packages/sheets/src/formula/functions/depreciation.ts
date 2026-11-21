// Depreciation functions (docs/specs/029-sheets/formulas.md "Functions": Finance): how much of an asset's cost one
// period writes off, straight-line (SLN, AMORLINC), by the sum of the years' digits (SYD) or on a declining balance
// (DB, DDB, VDB).
import type { FormulaMeaning } from '../meaning';
import { numFn, type FnDef } from '../fn';
import { err, isError } from '../values';
import { basisOf, yearFrac } from './day-count';
import { financeFn } from './finance-args';

// The double (or `factor`) declining balance write-off of period `period`, never taking the value below salvage. A
// rate of 1 or more writes the whole value off in the first period, as both standards' MIN does (OpenFormula Part 4
// §6.12.14, Microsoft's help; the file's meaning); Google keeps the rate, so a later period's value turns negative
// and its write-off with it (DDB(2400, 300, 2, 2, 3) is -1800; measured).
function ddb(
  cost: number,
  salvage: number,
  life: number,
  period: number,
  factor: number,
  meaning: FormulaMeaning = 'google',
): number {
  let rate = factor / life;
  let before: number;
  if (rate >= 1 && meaning !== 'google') {
    rate = 1;
    before = period === 1 ? cost : 0;
  } else before = cost * (1 - rate) ** (period - 1);
  const after = cost * (1 - rate) ** period;
  if (after < salvage) return Math.max(0, before - salvage);
  return meaning === 'google' ? before - after : Math.max(0, before - after);
}

// Google's VDB from a fraction of a period (measured): the value at the start (whole periods, then the fraction at
// the declining rate), then steps of a whole period from there, the last a fraction. VDB(2400, 300, 10, 1.5, 4.25)
// steps 1.5 to 2.5, 2.5 to 3.5 and 3.5 to 4.25. Each step switches to straight-line over the life left once that
// writes off more, and never takes the value below salvage.
function vdbStepping(
  cost: number,
  salvage: number,
  life: number,
  start: number,
  end: number,
  factor: number,
): number {
  const rate = Math.min(1, factor / life);
  const walk = (from: number, to: number, value: number): number => {
    let t = from;
    let left = value;
    let sum = 0;
    while (t < to) {
      const step = Math.min(1, to - t);
      const declining = left * rate * step;
      const straight = ((left - salvage) / (life - t)) * step;
      const term = Math.min(Math.max(declining, straight), Math.max(0, left - salvage));
      sum += term;
      left -= term;
      t += step;
    }
    return sum;
  };
  return walk(start, end, cost - walk(0, start, cost));
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
  // A fractional period is the period it falls in (2.5 is the third) and a salvage above the cost writes nothing off,
  // as Google's (measured; OpenFormula's constraints refuse both).
  DDB: numFn(4, 5, ([cost, salvage, life, period, factor = 2], f) =>
    cost! < 0 || salvage! < 0 || factor <= 0 || period! <= 0 || period! > life!
      ? err('#NUM!', 'The period is within the life, and the cost and salvage are not negative')
      : ddb(cost!, salvage!, life!, Math.ceil(period!), factor, f.meaning),
  ),
  // A salvage above the cost gives a negative rate, as OpenFormula's formula and Google do. Google refuses a period
  // past the life; both standards take the part year after it when the first year is short (OpenFormula Part 4
  // §6.12.13, Microsoft's help; the file's meaning).
  DB: numFn(4, 5, ([cost, salvage, life, period, month = 12], f) => {
    const months = Math.floor(month);
    if (months < 1 || months > 12) return err('#NUM!', 'The first year has 1 to 12 months');
    if (cost! <= 0 || salvage! < 0 || life! <= 0 || life! > 1200)
      return err(
        '#NUM!',
        'The cost is positive, the salvage not negative, the life from 1 to 1200',
      );
    const last = f.meaning === 'google' ? life! : life! + 1;
    if (period! <= 0 || period! > last) return err('#NUM!', 'The period is within the life');
    return db(cost!, salvage!, life!, period!, months);
  }),
  // From a fraction of a period Google steps whole periods from it, unless told not to switch to straight-line
  // (measured); OpenFormula takes the fraction off the whole periods around it (Part 4 §6.12.50; the file's meaning).
  VDB: numFn(5, 7, ([cost, salvage, life, start, end, factor = 2, noSwitch = 0], f) => {
    if (start! < 0 || end! < start! || end! > life! || cost! < 0 || salvage! > cost! || factor <= 0)
      return err(
        '#NUM!',
        'The periods run from 0 to the life, and the salvage is at most the cost',
      );
    const stepping = f.meaning !== 'openformula' && noSwitch === 0 && !Number.isInteger(start!);
    return stepping
      ? vdbStepping(cost!, salvage!, life!, start!, end!, factor)
      : vdb(cost!, salvage!, life!, start!, end!, factor, noSwitch !== 0);
  }),
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
