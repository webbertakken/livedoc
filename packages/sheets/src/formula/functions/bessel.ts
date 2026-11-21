// The Bessel functions (docs/specs/029-sheets/formulas.md "Functions": Engineering): BESSELJ, BESSELY, BESSELI and
// BESSELK of a whole order n (truncated, from 0); BESSELY and BESSELK need x above 0.
import { besselI, besselJ, besselK, besselY } from '../bessel';
import { numFn, type FnDef } from '../fn';
import { err, type Value } from '../values';

function bessel(of: (n: number, x: number) => number, positiveX: boolean): FnDef {
  return numFn(2, 2, ([x, order]): Value => {
    const n = Math.trunc(order!);
    if (n < 0) return err('#NUM!', 'The order cannot be negative');
    if (positiveX && x! <= 0) return err('#NUM!', 'x must be above 0');
    return of(n, x!);
  });
}

export const BESSEL_FUNCTIONS: Record<string, FnDef> = {
  BESSELJ: bessel(besselJ, false),
  BESSELY: bessel(besselY, true),
  BESSELI: bessel(besselI, false),
  BESSELK: bessel(besselK, true),
};
