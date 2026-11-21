// The single-value parameters a function works cell by cell over, in an array context, though it reads its other
// arguments whole (formulas.md "Arrays and spills"): `=ARRAYFORMULA(VLOOKUP(A2:A5, D:E, 2, FALSE))` looks up four
// keys. Functions of single values only lift through `lift` already; SUMIFS and COUNTIFS do not lift (D67).
import { isAreas, isRef, type EvalValue, type Frame } from '../engine/frame';
import { deref, lift } from './fn';
import { isArray, scalarOf, type Value } from './values';

export const LIFTED_PARAMETERS: Readonly<Record<string, readonly number[]>> = {
  AVERAGEIF: [1],
  COUNTIF: [1],
  HLOOKUP: [0],
  LARGE: [1],
  MATCH: [0],
  SMALL: [1],
  SUMIF: [1],
  VLOOKUP: [0],
};

// Whether an argument holds more than one value to lift over: a range of more than one cell, or an array.
function many(v: EvalValue): boolean {
  if (isRef(v)) return v.ref.r1 !== v.ref.r2 || v.ref.c1 !== v.ref.c2;
  return !isAreas(v) && isArray(v);
}

/**
 * A call worked out once per cell of its lifted arguments, when an array context hands one of them many values;
 * `null` when there is nothing to lift over (the call goes ahead as it is).
 */
export function liftedCall(
  name: string,
  args: EvalValue[],
  f: Frame,
  call: (args: EvalValue[]) => EvalValue,
): Value | null {
  const at = LIFTED_PARAMETERS[name];
  if (!f.arrays || !at || !at.some((i) => many(args[i]!))) return null;
  const values = at.map((i) => deref(args[i]!, f));
  return lift(values, (xs) => {
    const each = [...args];
    at.forEach((i, k) => (each[i] = xs[k]!));
    return scalarOf(deref(call(each), f));
  });
}
