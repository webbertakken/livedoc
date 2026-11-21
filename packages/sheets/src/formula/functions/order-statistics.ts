// Where values stand in order (docs/specs/029-sheets/formulas.md "Functions": Statistics): MEDIAN and the modes,
// LARGE and SMALL, the ranks, percentiles, quartiles and percentage ranks.
import type { EvalValue, Frame } from '../../engine/frame';
import {
  ascending,
  percentRank,
  percentileExclusive,
  percentileInclusive,
  roundSignificant,
} from '../descriptive';
import { MANY, fn, numArg, numbersOf, opt, type FnDef } from '../fn';
import { err, isError, type SheetError, type Value } from '../values';

const NO_NUMBERS = err('#NUM!', 'No numbers to work on');
const OUT_OF_RANGE = err('#NUM!', 'The value is out of range');

// The numbers of a data argument and a number argument after it.
function dataAnd(args: EvalValue[], f: Frame): { ns: number[]; x: number } | SheetError {
  const ns = numbersOf([args[0]!], f);
  if (isError(ns)) return ns;
  const x = numArg(args[1]!, f);
  return isError(x) ? x : { ns, x };
}

function overData(each: (ns: number[], x: number) => Value): FnDef {
  return fn(2, 2, (args, f) => {
    const read = dataAnd(args, f);
    return isError(read) ? read : each(read.ns, read.x);
  });
}

// The values seen most often, at least twice, in the order they first appear.
function modes(ns: number[]): number[] {
  const counts = new Map<number, number>();
  let most = 1;
  for (const n of ns) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > most) most = c;
  }
  if (most < 2) return [];
  return [...counts.keys()].filter((n) => counts.get(n) === most);
}

function modeFn(all: boolean): FnDef {
  return fn(1, MANY, (args, f) => {
    const ns = numbersOf(args, f);
    if (isError(ns)) return ns;
    const found = modes(ns);
    if (found.length === 0) return err('#N/A', 'No value repeats');
    return all ? { rows: found.map((n) => [n]) } : found[0]!;
  });
}

// The k-th largest or smallest: k rounds up for LARGE and down for SMALL, as LibreOffice's do.
function nth(largest: boolean): FnDef {
  return overData((ns, x) => {
    const k = largest ? Math.ceil(x) : Math.floor(x);
    if (k < 1 || k > ns.length) return OUT_OF_RANGE;
    const s = ascending(ns);
    return largest ? s[s.length - k]! : s[k - 1]!;
  });
}

// The rank of a value among the data, 1 for the greatest (or with is_ascending, the least); RANK.AVG gives tied
// values the mean of the ranks they share.
function rank(average: boolean): FnDef {
  return fn(2, 3, (args, f) => {
    const v = numArg(args[0]!, f);
    if (isError(v)) return v;
    const ns = numbersOf([args[1]!], f);
    if (isError(ns)) return ns;
    const ascendingOrder = opt(args, 2, f, numArg, 0);
    if (isError(ascendingOrder)) return ascendingOrder;
    const ties = ns.filter((n) => n === v).length;
    if (ties === 0) return err('#N/A', 'The value is not in the data');
    const before = ns.filter((n) => (ascendingOrder ? n < v : n > v)).length;
    return average ? before + (ties + 1) / 2 : before + 1;
  });
}

function percentileInc(ns: number[], k: number): Value {
  if (ns.length === 0) return NO_NUMBERS;
  if (k < 0 || k > 1) return err('#NUM!', 'The percentile must be from 0 to 1');
  return percentileInclusive(ascending(ns), k);
}

function percentileExc(ns: number[], k: number): Value {
  if (ns.length === 0) return NO_NUMBERS;
  return percentileExclusive(ascending(ns), k) ?? err('#NUM!', 'The percentile is too near 0 or 1');
}

// Percentage ranks are rounded to significant_digits (3 by default); a count below 1 is the default (Google's help).
// A value outside the data is #N/A, as Google's help says of PERCENTRANK; the .INC and .EXC forms are the same
// function in Excel and OpenFormula and answer alike (default, D57).
const SIGNIFICANT_DIGITS_DEFAULT = 3;

// PERCENTRANK's significance below 1: Google reads it as 3; both standards refuse it, #NUM! (OpenFormula Part 4
// §6.18.58, Microsoft's help; the file's meaning).
function percentRankFn(inclusive: boolean, significanceBelowOneRefused = false): FnDef {
  return fn(2, 3, (args, f) => {
    const read = dataAnd(args, f);
    if (isError(read)) return read;
    const digits = opt(args, 2, f, numArg, SIGNIFICANT_DIGITS_DEFAULT);
    if (isError(digits)) return digits;
    const s = ascending(read.ns);
    if (s.length === 0 || read.x < s[0]! || read.x > s[s.length - 1]!)
      return err('#N/A', 'The value is outside the data');
    if (Math.floor(digits) < 1 && significanceBelowOneRefused && f.meaning !== 'google')
      return err('#NUM!', 'The significance is at least 1');
    const places = Math.floor(digits) < 1 ? SIGNIFICANT_DIGITS_DEFAULT : Math.floor(digits);
    return roundSignificant(percentRank(s, read.x, inclusive), places);
  });
}

const quartileInc = overData((ns, q) => {
  const k = Math.trunc(q);
  return k < 0 || k > 4
    ? err('#NUM!', 'The quartile must be from 0 to 4')
    : percentileInc(ns, k / 4);
});

export const ORDER_FUNCTIONS: Record<string, FnDef> = {
  MEDIAN: fn(1, MANY, (args, f) => {
    const ns = numbersOf(args, f);
    return isError(ns) ? ns : percentileInc(ns, 0.5);
  }),
  // Of the values seen most often, the one that comes first, as Excel and Google Sheets choose: MODE(3, 5, 5, 3)
  // is 3, not the 5 that reached two first.
  MODE: modeFn(false),
  'MODE.SNGL': modeFn(false),
  'MODE.MULT': modeFn(true),
  LARGE: nth(true),
  SMALL: nth(false),
  RANK: rank(false),
  'RANK.EQ': rank(false),
  'RANK.AVG': rank(true),
  PERCENTILE: overData(percentileInc),
  'PERCENTILE.INC': overData(percentileInc),
  'PERCENTILE.EXC': overData(percentileExc),
  QUARTILE: quartileInc,
  'QUARTILE.INC': quartileInc,
  'QUARTILE.EXC': overData((ns, q) => {
    const k = Math.trunc(q);
    return k < 1 || k > 3
      ? err('#NUM!', 'The quartile must be 1, 2 or 3')
      : percentileExc(ns, k / 4);
  }),
  PERCENTRANK: percentRankFn(true, true),
  'PERCENTRANK.INC': percentRankFn(true),
  'PERCENTRANK.EXC': percentRankFn(false),
};
