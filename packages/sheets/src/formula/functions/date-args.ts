// How the date functions read a date argument and hold a result to the dates a sheet has (docs/specs/029-sheets/
// formulas.md "Functions": Date and time).
import { SERIAL_MAX, localeDayFirst, parseDateText } from '../../dates';
import type { EvalValue, Frame } from '../../engine/frame';
import { scalarArg } from '../fn';
import { err, toNumber, type Value } from '../values';

export function checkSerial(n: number): Value {
  return n < 0 || n > SERIAL_MAX ? err('#NUM!', 'The date is out of range') : n;
}

/** A date argument: a number, or text that reads as a date ("2026-10-08"). */
export function dateArg(v: EvalValue, f: Frame): number | Value {
  const x = scalarArg(v, f);
  if (typeof x === 'string') {
    const d = parseDateText(x, localeDayFirst(f.locale));
    if (d) return d.serial;
  }
  return toNumber(x, f.locale);
}
