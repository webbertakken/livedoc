// EUROCONVERT (docs/specs/029-sheets/formulas.md "Functions": Parser): between the euro and the currencies it
// replaced, at the fixed rates the Council of the EU set, rounded to the target's decimals unless full precision.
import { scalarFn, type FnDef } from '../fn';
import { err, isError, toBool, toNumber, toText, type Value } from '../values';
import { roundHalfAway } from './math';

// Units of a currency to one euro, and the decimals its amounts are rounded to.
const EURO_RATES: Readonly<Record<string, readonly [number, number]>> = {
  EUR: [1, 2],
  ATS: [13.7603, 2],
  BEF: [40.3399, 0],
  DEM: [1.95583, 2],
  ESP: [166.386, 0],
  FIM: [5.94573, 2],
  FRF: [6.55957, 2],
  IEP: [0.787564, 2],
  ITL: [1936.27, 0],
  LUF: [40.3399, 0],
  NLG: [2.20371, 2],
  PTE: [200.482, 2],
  GRD: [340.75, 2],
  SIT: [239.64, 2],
  MTL: [0.4293, 2],
  CYP: [0.585274, 2],
  SKK: [30.126, 2],
  EEK: [15.6466, 2],
  LVL: [0.702804, 2],
  LTL: [3.4528, 2],
  HRK: [7.5345, 2],
  BGN: [1.95583, 2],
};

// A triangulation through the euro rounds its euro amount to at least this many decimals (the EU's rule).
const TRIANGULATION_DECIMALS_MIN = 3;

function euroConvert(
  value: number,
  from: string,
  to: string,
  full: boolean,
  places: number | null,
): Value {
  const source = EURO_RATES[from.toUpperCase()];
  const target = EURO_RATES[to.toUpperCase()];
  if (!source || !target) return err('#VALUE!', 'Not a euro currency');
  if (places !== null && places < TRIANGULATION_DECIMALS_MIN)
    return err('#NUM!', 'Triangulation needs at least 3 decimals');
  if (from.toUpperCase() === to.toUpperCase()) return value;
  let euros = value / source[0];
  if (places !== null && source[0] !== 1) euros = roundHalfAway(euros, places);
  const out = euros * target[0];
  return full ? out : roundHalfAway(out, target[1]);
}

export const EURO_FUNCTIONS: Record<string, FnDef> = {
  EUROCONVERT: scalarFn(3, 5, ([v, from, to, full = false, places = null]) => {
    const value = toNumber(v!);
    if (isError(value)) return value;
    const source = toText(from!);
    if (isError(source)) return source;
    const target = toText(to!);
    if (isError(target)) return target;
    const precise = toBool(full);
    if (isError(precise)) return precise;
    const digits = places === null ? null : toNumber(places);
    if (isError(digits)) return digits;
    return euroConvert(value, source, target, precise, digits === null ? null : Math.floor(digits));
  }),
};
