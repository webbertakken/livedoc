// The Engineering functions (docs/specs/029-sheets/formulas.md "Functions": Engineering): signed numbers in other
// radixes, bitwise functions and comparisons, the error function, complex numbers and Bessel functions.
import type { FnDef } from '../fn';
import { BESSEL_FUNCTIONS } from './bessel';
import { BITS_FUNCTIONS } from './bits';
import { ENGINEERING_COMPLEX_FUNCTIONS } from './engineering-complex';
import { RADIX_FUNCTIONS } from './radix';

export const ENGINEERING_FUNCTIONS: Record<string, FnDef> = {
  ...RADIX_FUNCTIONS,
  ...BITS_FUNCTIONS,
  ...ENGINEERING_COMPLEX_FUNCTIONS,
  ...BESSEL_FUNCTIONS,
};
