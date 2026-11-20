// Spread about the mean (docs/specs/029-sheets/formulas.md "Functions": Statistics): the STDEV and VAR families,
// their A forms (AVERAGEA, MAXA, MINA alike read text as 0 and TRUE as 1), DEVSQ and AVEDEV.
import type { EvalValue, Frame } from '../../engine/frame';
import { mean, sumOfSquaredDeviations } from '../descriptive';
import { MANY, fn, numbersOf, numbersOfA, type FnDef } from '../fn';
import { err, isError, type SheetError, type Value } from '../values';

/** A sample's variance (n - 1) or a population's (n); a sample needs two numbers, a population one. */
export function variance(ns: number[], sample: boolean): number | SheetError {
  if (ns.length < (sample ? 2 : 1)) return err('#DIV/0!');
  return sumOfSquaredDeviations(ns) / (ns.length - (sample ? 1 : 0));
}

type Reader = (args: EvalValue[], f: Frame) => number[] | SheetError;
const plain: Reader = numbersOf;
const withText: Reader = (args, f) => numbersOfA(args, f);

function aggregate(read: Reader, each: (ns: number[]) => Value): FnDef {
  return fn(1, MANY, (args, f) => {
    const ns = read(args, f);
    return isError(ns) ? ns : each(ns);
  });
}

// Google's help gives every population form (VARP, VAR.P, STDEVP, STDEV.P, STDEVPA) #DIV/0! for fewer than two
// numbers, and VARPA #NUM!.
function populationVariance(ns: number[], fewer: '#DIV/0!' | '#NUM!'): number | SheetError {
  return ns.length < 2 ? err(fewer, 'At least two numbers are needed') : variance(ns, false);
}

function root(v: number | SheetError): Value {
  return isError(v) ? v : Math.sqrt(v);
}

const sampleVar = (ns: number[]): number | SheetError => variance(ns, true);
const populationVar = (ns: number[]): number | SheetError => populationVariance(ns, '#DIV/0!');

export const VARIANCE_FUNCTIONS: Record<string, FnDef> = {
  VAR: aggregate(plain, sampleVar),
  'VAR.S': aggregate(plain, sampleVar),
  VARA: aggregate(withText, sampleVar),
  VARP: aggregate(plain, populationVar),
  'VAR.P': aggregate(plain, populationVar),
  VARPA: aggregate(withText, (ns) => populationVariance(ns, '#NUM!')),
  STDEV: aggregate(plain, (ns) => root(sampleVar(ns))),
  'STDEV.S': aggregate(plain, (ns) => root(sampleVar(ns))),
  STDEVA: aggregate(withText, (ns) => root(sampleVar(ns))),
  STDEVP: aggregate(plain, (ns) => root(populationVar(ns))),
  'STDEV.P': aggregate(plain, (ns) => root(populationVar(ns))),
  STDEVPA: aggregate(withText, (ns) => root(populationVar(ns))),
  AVERAGEA: aggregate(withText, (ns) => (ns.length === 0 ? err('#DIV/0!') : mean(ns))),
  // With no number, 0, as MAX and MIN; MAXA refuses text typed in that reads as no number, MINA reads it as 0.
  MAXA: fn(1, MANY, (args, f) => {
    const ns = numbersOfA(args, f, true);
    return isError(ns) ? ns : ns.reduce((m, n) => (n > m ? n : m), ns.length === 0 ? 0 : -Infinity);
  }),
  MINA: aggregate(withText, (ns) =>
    ns.reduce((m, n) => (n < m ? n : m), ns.length === 0 ? 0 : Infinity),
  ),
  // Google's help: fewer than two numbers is 0.
  DEVSQ: aggregate(plain, (ns) => (ns.length < 2 ? 0 : sumOfSquaredDeviations(ns))),
  AVEDEV: aggregate(plain, (ns) => {
    if (ns.length === 0) return err('#NUM!', 'No numbers to average');
    const m = mean(ns);
    let s = 0;
    for (const n of ns) s += Math.abs(n - m);
    return s / ns.length;
  }),
};
