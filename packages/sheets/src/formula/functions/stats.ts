// Statistics functions (docs/specs/029-sheets/formulas.md "Functions": Statistics): averages, least and greatest,
// and counts here; the family gathers spread, shape, order and paired data from their own modules.
import type { EvalValue, Frame } from '../../engine/frame';
import { MANY, arrayArg, flatScalars, flatValues, fn, numbersOf, type FnDef } from '../fn';
import { mean } from '../descriptive';
import { err, isError, type Value } from '../values';
import { PERMUTATION_FUNCTIONS } from './combinatorics';
import { DISCRETE_DISTRIBUTION_FUNCTIONS } from './discrete-distributions';
import { DISTRIBUTION_FUNCTIONS } from './distributions';
import { TEST_FUNCTIONS } from './hypothesis-tests';
import { criteriaMask, ifsNumbers, maskedNumbers, sameSizeAs } from './conditional';
import { MOMENT_FUNCTIONS } from './moments';
import { ORDER_FUNCTIONS } from './order-statistics';
import { PAIRED_FUNCTIONS } from './paired';
import { VARIANCE_FUNCTIONS } from './variances';

// The least and greatest of a list. Never `Math.min(...ns)`: past ~120,000 arguments the spread overflows the stack,
// and a formula over two full arrays or a few large ranges reaches that.
const smallest = (ns: readonly number[]): number => ns.reduce((m, n) => (n < m ? n : m), Infinity);
const largest = (ns: readonly number[]): number => ns.reduce((m, n) => (n > m ? n : m), -Infinity);

function aggregate(read: (ns: number[]) => Value) {
  return fn(1, MANY, (args, f) => {
    const ns = numbersOf(args, f);
    return isError(ns) ? ns : read(ns);
  });
}

function ifs(kind: 'avg' | 'min' | 'max') {
  return fn(3, MANY, (args, f) => {
    const ns = ifsNumbers(args, f, 'Pairs of range and criterion are needed');
    if (isError(ns)) return ns;
    if (kind === 'avg') return ns.length === 0 ? err('#DIV/0!') : mean(ns);
    if (ns.length === 0) return 0;
    return kind === 'min' ? smallest(ns) : largest(ns);
  });
}

function countIf(args: EvalValue[], f: Frame): Value {
  const pairs: [EvalValue, EvalValue][] = [];
  for (let i = 0; i + 1 < args.length; i += 2) pairs.push([args[i]!, args[i + 1]!]);
  if (pairs.length === 0 || args.length % 2 !== 0) return err('#N/A');
  const m = criteriaMask(pairs, f);
  if (isError(m)) return m;
  return m.mask.filter(Boolean).length;
}

export const STATS_FUNCTIONS: Record<string, FnDef> = {
  AVERAGE: aggregate((ns) => (ns.length === 0 ? err('#DIV/0!') : mean(ns))),
  AVERAGEIF: fn(2, 3, (args, f) => {
    const m = criteriaMask([[args[0]!, args[1]!]], f);
    if (isError(m)) return m;
    const values =
      args[2] !== undefined && args[2] !== null ? sameSizeAs(args[2], m.shape, f) : m.shape;
    const ns = maskedNumbers(values, m.mask);
    if (isError(ns)) return ns;
    return ns.length === 0 ? err('#DIV/0!') : mean(ns);
  }),
  AVERAGEIFS: ifs('avg'),
  MINIFS: ifs('min'),
  MAXIFS: ifs('max'),
  MIN: aggregate((ns) => (ns.length === 0 ? 0 : smallest(ns))),
  MAX: aggregate((ns) => (ns.length === 0 ? 0 : largest(ns))),
  COUNT: fn(1, MANY, (args, f) => {
    let n = 0;
    for (const a of args) {
      for (const x of flatScalars([a], f)) if (typeof x === 'number') n++;
      // A number typed as text in the arguments themselves counts, as in Sheets.
      if (a !== null && typeof a === 'string' && !Number.isNaN(Number(a)) && a.trim() !== '') n++;
      // So does TRUE or FALSE typed as an argument (COUNT(TRUE, 1) is 2); one in a range does not.
      if (typeof a === 'boolean') n++;
    }
    return n;
  }),
  COUNTA: fn(1, MANY, (args, f) => flatScalars(args, f).filter((x) => x !== null).length),
  // Distinct values, empty cells aside; a number and its text (1, "1") are two, and text keeps its case, as UNIQUE.
  COUNTUNIQUE: fn(1, MANY, (args, f) => {
    const seen = new Set<string>();
    for (const x of flatScalars(args, f)) {
      if (x === null || x === '') continue;
      seen.add(isError(x) ? `e${x.e}` : `${typeof x}:${String(x)}`);
    }
    return seen.size;
  }),
  COUNTBLANK: fn(
    1,
    1,
    (args, f) => flatValues(arrayArg(args[0]!, f)).filter((x) => x === null || x === '').length,
  ),
  COUNTIF: fn(2, 2, (args, f) => countIf(args, f)),
  COUNTIFS: fn(2, MANY, (args, f) => countIf(args, f)),
  ...VARIANCE_FUNCTIONS,
  ...MOMENT_FUNCTIONS,
  ...ORDER_FUNCTIONS,
  ...PAIRED_FUNCTIONS,
  ...PERMUTATION_FUNCTIONS,
  ...DISTRIBUTION_FUNCTIONS,
  ...DISCRETE_DISTRIBUTION_FUNCTIONS,
  ...TEST_FUNCTIONS,
};
