// Signed numbers in binary, octal and hexadecimal (docs/specs/029-sheets/formulas.md "Functions": Engineering): ten
// digits each, the top bit the sign, negatives in two's complement; BIN2DEC, DEC2HEX, HEX2OCT and the rest.
import { scalarFn, type FnDef } from '../fn';
import { err, isError, numberText, toNumber, type Scalar, type SheetError } from '../values';

type Radix = 2 | 8 | 16;

// Every signed number is at most ten digits: 10 bits in binary, 30 in octal, 40 in hexadecimal.
export const RADIX_DIGITS_MAX = 10;
const BITS: Record<Radix, number> = { 2: 10, 8: 30, 16: 40 };
const NAMES: Record<Radix, string> = { 2: 'binary', 8: 'octal', 16: 'hexadecimal' };

// A signed number's digits: text as it is, a number by its digits, TRUE 1 and FALSE 0.
function digitsOf(v: Scalar): string | SheetError {
  if (isError(v)) return v;
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return typeof v === 'number' ? numberText(v) : v.trim();
}

/** Signed digits read in a radix; empty text is 0. */
function readSigned(v: Scalar, radix: Radix): number | SheetError {
  const digits = digitsOf(v);
  if (isError(digits)) return digits;
  const valid = { 2: /^[01]*$/, 8: /^[0-7]*$/, 16: /^[0-9a-f]*$/i }[radix];
  if (digits.length > RADIX_DIGITS_MAX || !valid.test(digits))
    return err('#NUM!', `"${digits}" is not a signed ${NAMES[radix]} number of up to 10 digits`);
  const n = digits === '' ? 0 : parseInt(digits, radix);
  const bits = BITS[radix];
  return n >= 2 ** (bits - 1) ? n - 2 ** bits : n;
}

/** A whole number written in a radix: a negative one as ten digits, any other padded to `places`. */
function writeSigned(n: number, radix: Radix, places: number | null): string | SheetError {
  const bits = BITS[radix];
  const whole = Math.trunc(n);
  if (whole < -(2 ** (bits - 1)) || whole >= 2 ** (bits - 1))
    return err('#NUM!', `${numberText(whole)} does not fit in 10 ${NAMES[radix]} digits`);
  if (whole < 0) return (whole + 2 ** bits).toString(radix).toUpperCase();
  const text = whole.toString(radix).toUpperCase();
  if (places === null) return text;
  const width = Math.trunc(places);
  if (width < 0 || width > RADIX_DIGITS_MAX) return err('#NUM!', 'The places are 0 to 10');
  if (text.length > width) return err('#NUM!', `${text} needs more than ${width} digits`);
  return text.padStart(width, '0');
}

// A conversion from a radix (or decimal) to a radix, with optional places.
function toRadix(from: Radix | 10, to: Radix): FnDef {
  return scalarFn(1, 2, ([x, p]) => {
    const n = from === 10 ? toNumber(x!) : readSigned(x!, from);
    if (isError(n)) return n;
    const places = p === undefined || p === null ? null : toNumber(p);
    if (isError(places)) return places;
    return writeSigned(n, to, places);
  });
}

function toDecimal(from: Radix): FnDef {
  return scalarFn(1, 1, ([x]) => readSigned(x!, from));
}

export const RADIX_FUNCTIONS: Record<string, FnDef> = {
  BIN2DEC: toDecimal(2),
  BIN2HEX: toRadix(2, 16),
  BIN2OCT: toRadix(2, 8),
  DEC2BIN: toRadix(10, 2),
  DEC2HEX: toRadix(10, 16),
  DEC2OCT: toRadix(10, 8),
  HEX2BIN: toRadix(16, 2),
  HEX2DEC: toDecimal(16),
  HEX2OCT: toRadix(16, 8),
  OCT2BIN: toRadix(8, 2),
  OCT2DEC: toDecimal(8),
  OCT2HEX: toRadix(8, 16),
};
