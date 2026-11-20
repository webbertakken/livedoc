// Cash flow functions (docs/specs/029-sheets/formulas.md "Functions": Finance): the values of a series of payments
// and receipts, regular (NPV, IRR, MIRR) or dated (XNPV, XIRR), and a principal compounded by a schedule of rates
// (its text and empty cells skipped).
import type { EvalValue, Frame } from '../../engine/frame';
import { MANY, arrayArg, flatValues, fn, numArg, numbersOf, opt, type FnDef } from '../fn';
import { err, isError, type SheetError } from '../values';
import { solve } from './solve';

function npv(rate: number, values: number[]): number {
  let s = 0;
  values.forEach((v, i) => {
    s += v / (1 + rate) ** (i + 1);
  });
  return s;
}

// The numbers of a range or array of cash flows: text, booleans and empty cells skipped, an error returned.
function flows(v: EvalValue, f: Frame): number[] | SheetError {
  const out: number[] = [];
  for (const x of flatValues(arrayArg(v, f))) {
    if (isError(x)) return x;
    if (typeof x === 'number') out.push(x);
  }
  return out;
}

// Every cell of a range or array as a number, for the dated flows: anything else is `#VALUE!`.
function allNumbers(v: EvalValue, f: Frame): number[] | SheetError {
  const out: number[] = [];
  for (const x of flatValues(arrayArg(v, f))) {
    if (isError(x)) return x;
    if (typeof x !== 'number') return err('#VALUE!', 'Every amount and date is a number');
    out.push(x);
  }
  return out;
}

const bothSigns = (values: number[]) => values.some((v) => v > 0) && values.some((v) => v < 0);

// The amounts and their dates, paired: the same count, at least two, the dates whole days.
function datedFlows(
  args: EvalValue[],
  f: Frame,
): { values: number[]; years: number[] } | SheetError {
  const values = allNumbers(args[0]!, f);
  if (isError(values)) return values;
  const dates = allNumbers(args[1]!, f);
  if (isError(dates)) return dates;
  if (values.length !== dates.length || values.length < 2)
    return err('#NUM!', 'Each amount has one date, and there are at least two');
  const first = Math.floor(dates[0]!);
  return { values, years: dates.map((d) => (Math.floor(d) - first) / 365) };
}

const xnpv = (rate: number, values: number[], years: number[]) =>
  values.reduce((s, v, i) => s + v / (1 + rate) ** years[i]!, 0);

// XIRR: Newton's method from the guess, then from each rate from -99% up by 1% until one settles.
function xirr(values: number[], years: number[], guess: number): number | null {
  const value = (r: number) => xnpv(r, values, years);
  const slope = (r: number) =>
    values.reduce((s, v, i) => s - (years[i]! * v) / (1 + r) ** (years[i]! + 1), 0);
  for (let attempt = 0; attempt < 200; attempt++) {
    let rate = attempt === 0 ? guess : -0.99 + (attempt - 1) * 0.01;
    for (let i = 0; i < 50; i++) {
      const y = value(rate);
      const next = rate - y / slope(rate);
      const settled = Math.abs(next - rate) <= 1e-10 || Math.abs(y) <= 1e-10;
      rate = next;
      if (settled) break;
    }
    if (Number.isFinite(rate) && Math.abs(value(rate)) <= 1e-6) return rate;
  }
  return null;
}

export const CASH_FLOW_FUNCTIONS: Record<string, FnDef> = {
  NPV: fn(2, MANY, (args, f) => {
    const rate = numArg(args[0]!, f);
    if (isError(rate)) return rate;
    const values = numbersOf(args.slice(1), f);
    if (isError(values)) return values;
    return npv(rate, values);
  }),
  IRR: fn(1, 2, (args, f) => {
    const values = flows(args[0]!, f);
    if (isError(values)) return values;
    if (!bothSigns(values)) return err('#NUM!', 'IRR needs both a payment and a receipt');
    const guess = opt(args, 1, f, numArg, 0.1);
    if (isError(guess)) return guess;
    const r = solve((x) => values.reduce((s, v, i) => s + v / (1 + x) ** i, 0), guess);
    return r === null ? err('#NUM!', 'IRR did not settle; try another guess') : r;
  }),
  MIRR: fn(3, 3, (args, f) => {
    const values = flows(args[0]!, f);
    if (isError(values)) return values;
    const finance = numArg(args[1]!, f);
    if (isError(finance)) return finance;
    const reinvest = numArg(args[2]!, f);
    if (isError(reinvest)) return reinvest;
    if (!bothSigns(values)) return err('#DIV/0!', 'MIRR needs both a payment and a receipt');
    let paid = 0;
    let received = 0;
    values.forEach((v, i) => {
      if (v < 0) paid += v / (1 + finance) ** i;
      else received += v / (1 + reinvest) ** i;
    });
    const n = values.length;
    const r = ((-received * (1 + reinvest) ** (n - 1)) / paid) ** (1 / (n - 1)) - 1;
    return Number.isFinite(r) ? r : err('#NUM!');
  }),
  XNPV: fn(3, 3, (args, f) => {
    const rate = numArg(args[0]!, f);
    if (isError(rate)) return rate;
    const flow = datedFlows(args.slice(1), f);
    if (isError(flow)) return flow;
    const r = xnpv(rate, flow.values, flow.years);
    return Number.isFinite(r) ? r : err('#NUM!');
  }),
  XIRR: fn(2, 3, (args, f) => {
    const flow = datedFlows(args, f);
    if (isError(flow)) return flow;
    const guess = opt(args, 2, f, numArg, 0.1);
    if (isError(guess)) return guess;
    if (guess <= -1) return err('#NUM!', 'The guess is more than -1');
    const r = xirr(flow.values, flow.years, guess);
    return r === null ? err('#NUM!', 'XIRR did not settle; try another guess') : r;
  }),
  FVSCHEDULE: fn(2, 2, (args, f) => {
    const principal = numArg(args[0]!, f);
    if (isError(principal)) return principal;
    let value = principal;
    for (const x of flatValues(arrayArg(args[1]!, f))) {
      if (isError(x)) return x;
      if (typeof x === 'number') value *= 1 + x;
    }
    return Number.isFinite(value) ? value : err('#NUM!');
  }),
};
