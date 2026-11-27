// A pivot table's summaries (docs/specs/029-sheets/pivot-tables.md "The output", Summaries): each as the spreadsheet
// function of its name over the cells of a pivot cell's rows. Numbers alone count for the arithmetic ones; an error
// among the cells answers itself, as the functions do.
import { err, isError, type Scalar } from '../formula/values';
import { ascending, mean, sumOfSquaredDeviations } from '../formula/descriptive';
import type { PivotSummary } from './pivot-spec';

const isBlank = (v: Scalar) => v === null || v === '';

// The variance of numbers over n less `less` (1 a sample's, 0 a population's).
function variance(ns: readonly number[], less: 0 | 1): Scalar {
  if (ns.length - less <= 0) return err('#DIV/0!');
  return sumOfSquaredDeviations(ns) / (ns.length - less);
}

const ARITHMETIC: Record<
  Exclude<PivotSummary, 'COUNTA' | 'COUNT' | 'COUNTUNIQUE'>,
  (ns: number[]) => Scalar
> = {
  SUM: (ns) => ns.reduce((a, b) => a + b, 0),
  AVERAGE: (ns) => (ns.length ? mean(ns) : err('#DIV/0!')),
  MAX: (ns) => (ns.length ? Math.max(...ns) : 0),
  MIN: (ns) => (ns.length ? Math.min(...ns) : 0),
  MEDIAN: (ns) => {
    if (!ns.length) return err('#NUM!');
    const s = ascending(ns);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  },
  PRODUCT: (ns) => (ns.length ? ns.reduce((a, b) => a * b, 1) : 0),
  STDEV: (ns) => {
    const v = variance(ns, 1);
    return typeof v === 'number' ? Math.sqrt(v) : v;
  },
  STDEVP: (ns) => {
    const v = variance(ns, 0);
    return typeof v === 'number' ? Math.sqrt(v) : v;
  },
  VAR: (ns) => variance(ns, 1),
  VARP: (ns) => variance(ns, 0),
};

/** A summary of `cells`. */
export function summarise(summary: PivotSummary, cells: readonly Scalar[]): Scalar {
  if (summary === 'COUNTA') return cells.filter((v) => !isBlank(v)).length;
  if (summary === 'COUNTUNIQUE') {
    const seen = new Set<string>();
    for (const v of cells)
      if (!isBlank(v)) seen.add(isError(v) ? `e${v.e}` : `${typeof v}${String(v)}`);
    return seen.size;
  }
  const ns: number[] = [];
  for (const v of cells) {
    if (summary !== 'COUNT' && isError(v)) return v;
    if (typeof v === 'number') ns.push(v);
  }
  return summary === 'COUNT' ? ns.length : ARITHMETIC[summary](ns);
}
