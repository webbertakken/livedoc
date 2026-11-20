// SUBTOTAL (docs/specs/029-sheets/formulas.md "Functions": Math): one of eleven aggregates over references, leaving
// out the rows the sheet's filter hides, the rows hidden by hand too for codes 101 to 111, and every cell whose own
// formula is a SUBTOTAL, so subtotals inside a range are not counted twice.
import { isAreas, isRef, type EvalValue, type Frame, type RangeRef } from '../../engine/frame';
import { MANY, deref, fn, intArg, numbersOf, type FnDef } from '../fn';
import { err, isArray, isError, type SheetError, type Value } from '../values';
import { STATS_FUNCTIONS } from './stats';

const BY_HAND = 100;

type Aggregate = (values: Value, f: Frame) => EvalValue;

// A statistics function, given the kept values as its one argument (none of them is lazy).
function stat(name: string): Aggregate {
  const def = STATS_FUNCTIONS[name] as Extract<FnDef, { lazy?: false }>;
  return (v, f) => def.impl([v], f);
}

function sum(v: Value, f: Frame): Value {
  const ns = numbersOf([v], f);
  return isError(ns) ? ns : Number(ns.reduce((s, n) => s + n, 0).toPrecision(15));
}

function product(v: Value, f: Frame): Value {
  const ns = numbersOf([v], f);
  return isError(ns) ? ns : ns.reduce((p, n) => p * n, 1);
}

// Each code's aggregate, 1 to 11 (and 101 to 111), as Google and Excel number them.
const AGGREGATES: readonly Aggregate[] = [
  stat('AVERAGE'),
  stat('COUNT'),
  stat('COUNTA'),
  stat('MAX'),
  stat('MIN'),
  product,
  stat('STDEV'),
  stat('STDEV.P'),
  sum,
  stat('VAR'),
  stat('VAR.P'),
];

// The values of a range SUBTOTAL keeps, read as any range is (noted, within the budget), row by row.
function keptValues(range: RangeRef, byHand: boolean, f: Frame, out: Value[][]): SheetError | null {
  // A range of more than one cell is an array or an error (past the read budget); one cell is its value, an error
  // too, which a hidden row still leaves out.
  const v = deref({ ref: range }, f);
  if (isError(v) && (range.r1 !== range.r2 || range.c1 !== range.c2)) return v;
  const rows = isArray(v) ? v.rows : [[v]];
  rows.forEach((row, i) => {
    const r = range.r1 + i;
    const hidden = f.rowHidden(range.sheetId, r);
    if (hidden === 'filtered' || (hidden === 'hidden' && byHand)) return;
    row.forEach((x, j) => {
      if (!f.formulaCalls(range.sheetId, r, range.c1 + j, 'SUBTOTAL')) out.push([x]);
    });
  });
  return null;
}

export const SUBTOTAL_FUNCTIONS: Record<string, FnDef> = {
  SUBTOTAL: fn(2, MANY, (args, f) => {
    const code = intArg(args[0]!, f);
    if (isError(code)) return code;
    const byHand = code > BY_HAND;
    const aggregate = AGGREGATES[(byHand ? code - BY_HAND : code) - 1];
    if (!aggregate) return err('#VALUE!', 'The function code is 1 to 11 or 101 to 111');
    const kept: Value[][] = [];
    for (const a of args.slice(1)) {
      const ranges = isRef(a) ? [a.ref] : isAreas(a) ? a.areas : null;
      if (ranges) {
        for (const range of ranges) {
          const failed = keptValues(range, byHand, f, kept);
          if (failed) return failed;
        }
        continue;
      }
      // An array or a value is taken whole: it has no rows to hide.
      const v = deref(a, f);
      if (isArray(v)) for (const row of v.rows) for (const x of row) kept.push([x]);
      else kept.push([v]);
    }
    return aggregate({ rows: kept.length > 0 ? kept : [[null]] }, f);
  }),
};
