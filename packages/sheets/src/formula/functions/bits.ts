// Engineering's numeric functions (docs/specs/029-sheets/formulas.md "Functions": Engineering): bitwise AND, OR, XOR
// and shifts of whole numbers below 2^48, DELTA and GESTEP's comparisons, and the error function.
import { numFn, type FnDef } from '../fn';
import { erf } from '../special-functions';
import { err } from '../values';

// The bitwise functions take whole numbers from 0 to 2^48 - 1 (Excel's and OpenFormula's range); a shift is at most
// 53 places either way (Google's).
export const BIT_VALUE_LIMIT = 2 ** 48;
export const BIT_SHIFT_MAX = 53;

const OUT_OF_RANGE = err('#NUM!', 'Bitwise values are whole numbers from 0 to 2^48 - 1');

function bitValue(n: number): bigint | null {
  const whole = Math.trunc(n);
  return whole >= 0 && whole < BIT_VALUE_LIMIT ? BigInt(whole) : null;
}

function bitwise(op: (a: bigint, b: bigint) => bigint): FnDef {
  return numFn(2, 2, ([a, b]) => {
    const x = bitValue(a!);
    const y = bitValue(b!);
    return x === null || y === null ? OUT_OF_RANGE : Number(op(x, y));
  });
}

// A shift left by `places`, right when negative; the value's fraction is dropped first.
function shifted(value: number, places: number): number | typeof OUT_OF_RANGE {
  const x = bitValue(value);
  const by = Math.trunc(places);
  if (x === null) return OUT_OF_RANGE;
  if (Math.abs(by) > BIT_SHIFT_MAX) return err('#NUM!', 'A shift is at most 53 places');
  return by >= 0 ? Number(x) * 2 ** by : Number(x >> BigInt(-by));
}

export const BITS_FUNCTIONS: Record<string, FnDef> = {
  BITAND: bitwise((a, b) => a & b),
  BITOR: bitwise((a, b) => a | b),
  BITXOR: bitwise((a, b) => a ^ b),
  BITLSHIFT: numFn(2, 2, ([value, places]) => shifted(value!, places!)),
  BITRSHIFT: numFn(2, 2, ([value, places]) => shifted(value!, -places!)),
  // 1 when the numbers are equal (exactly), else 0; the second is 0 by default.
  DELTA: numFn(1, 2, ([a, b]) => (a === (b ?? 0) ? 1 : 0)),
  // 1 when the value is at least the step, 0 by default.
  GESTEP: numFn(1, 2, ([value, step]) => (value! >= (step ?? 0) ? 1 : 0)),
  // erf from 0 to the bound, or between two bounds.
  ERF: numFn(1, 2, ([lower, upper]) =>
    upper === undefined ? erf(lower!) : erf(upper) - erf(lower!),
  ),
  'ERF.PRECISE': numFn(1, 2, ([lower, upper]) =>
    upper === undefined ? erf(lower!) : erf(upper) - erf(lower!),
  ),
};
