// The Parser functions (docs/specs/029-sheets/formulas.md "Functions": Parser): CONVERT between units of measure, and
// Google's TO_ functions, which hand a number on with a format (TO_DATE, TO_DOLLARS, TO_PERCENT), without one
// (TO_PURE_NUMBER), or as the text its cell shows (TO_TEXT). Any other value passes through them unchanged.
import { formatNumber } from '../../number-format';
import { fn, refArg, scalarFn, valueArg, type FnDef } from '../fn';
import { findUnit } from '../units';
import { err, isError, scalarOf, toNumber, toText } from '../values';
import { EURO_FUNCTIONS } from './euro';

// The value itself: the format the TO_ functions give is the formula's format (typed-input.ts FORMULA_FORMATS).
const passThrough: FnDef = scalarFn(1, 1, ([x]) => x!);

export const PARSER_FUNCTIONS: Record<string, FnDef> = {
  ...EURO_FUNCTIONS,
  // A value in one unit as another of the same class: unknown units, or two classes, are #N/A.
  CONVERT: scalarFn(3, 3, ([x, from, to]) => {
    const value = toNumber(x!);
    const fromName = toText(from!);
    const toName = toText(to!);
    if (isError(value)) return value;
    if (isError(fromName)) return fromName;
    if (isError(toName)) return toName;
    const a = findUnit(fromName);
    const b = findUnit(toName);
    if (!a) return err('#N/A', `"${fromName}" is not a unit CONVERT knows`);
    if (!b) return err('#N/A', `"${toName}" is not a unit CONVERT knows`);
    if (a.cls !== b.cls) return err('#N/A', `${fromName} and ${toName} measure different things`);
    return (((value * a.size) / a.per + a.offset - b.offset) * b.per) / b.size;
  }),
  TO_DATE: passThrough,
  TO_DOLLARS: passThrough,
  TO_PERCENT: passThrough,
  TO_PURE_NUMBER: passThrough,
  // A number as text, as its cell shows it (a date as a date, a percentage as a percentage).
  TO_TEXT: fn(1, 1, (args, f) => {
    const v = scalarOf(valueArg(args[0]!, f));
    if (typeof v !== 'number') return v;
    const ref = refArg(args[0]);
    const one = ref && ref.r1 === ref.r2 && ref.c1 === ref.c2;
    const format = one ? f.format(ref.sheetId, ref.r1, ref.c1) : undefined;
    return formatNumber(v, format, f.locale);
  }),
};
