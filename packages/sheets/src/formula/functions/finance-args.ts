// How the finance functions read their arguments (docs/specs/029-sheets/formulas.md "Functions": Finance).
import { localeDayFirst, parseDateText } from '../../dates';
import { finite, scalarFn, type FnDef } from '../fn';
import { toNumber, type Scalar, type Value } from '../values';

/**
 * A finance function of numbers, lifted over arrays: the arguments at `dates` are dates, read from text as dates are
 * typed ("7/20/1969") and their time of day dropped. A result past a number's range is `#NUM!`.
 */
export function financeFn(
  min: number,
  max: number,
  dates: readonly number[],
  each: (ns: number[]) => Value,
): FnDef {
  return scalarFn(min, max, (xs, f) => {
    const ns: number[] = [];
    for (const [i, x] of xs.entries()) {
      const n = dates.includes(i) ? dateNumber(x, localeDayFirst(f.locale)) : toNumber(x);
      if (typeof n !== 'number') return n;
      ns.push(dates.includes(i) ? Math.floor(n) : n);
    }
    return finite(each(ns));
  });
}

function dateNumber(x: Scalar, dayFirst: boolean): Value {
  if (typeof x === 'string') {
    const d = parseDateText(x, dayFirst);
    if (d) return d.serial;
  }
  return toNumber(x);
}
