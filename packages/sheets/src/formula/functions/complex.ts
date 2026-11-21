// Complex numbers in Math (docs/specs/029-sheets/formulas.md "Complex numbers"): IMLN, IMPOWER, IMSQRT. Engineering's
// IM functions join them here.
import { scalarFn, type FnDef } from '../fn';
import { complexLn, complexPower, complexSqrt, readComplex, writeComplex } from '../complex';
import { err, isError, toNumber } from '../values';

const NO_RESULT = 'This has no complex result';

export const COMPLEX_FUNCTIONS: Record<string, FnDef> = {
  IMLN: scalarFn(1, 1, ([x]) => {
    const c = readComplex(x!);
    if (isError(c)) return c;
    const out = complexLn(c);
    // Written with i whatever the input used, as Google's IMLN("4+2j") example shows.
    // The logarithm of 0 is a division by zero, as Google gives it.
    return out ? writeComplex({ ...out, unit: 'i' }) : err('#DIV/0!', NO_RESULT);
  }),
  IMPOWER: scalarFn(2, 2, ([x, n], f) => {
    const c = readComplex(x!);
    const power = toNumber(n!, f.locale);
    if (isError(c)) return c;
    if (isError(power)) return power;
    const out = complexPower(c, power);
    return out ? writeComplex(out) : err('#NUM!', NO_RESULT);
  }),
  IMSQRT: scalarFn(1, 1, ([x]) => {
    const c = readComplex(x!);
    return isError(c) ? c : writeComplex(complexSqrt(c));
  }),
};
