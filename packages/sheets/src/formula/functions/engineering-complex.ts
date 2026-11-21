// Complex numbers in Engineering (docs/specs/029-sheets/formulas.md "Complex numbers"): COMPLEX builds one; the IM
// functions take one apart, add, multiply and divide them, and give their exponential, logarithms and trigonometry.
import { MANY, flatScalars, fn, scalarFn, textArg, numArg, opt, type FnDef } from '../fn';
import {
  complexCos,
  complexCosh,
  complexCot,
  complexCoth,
  complexDivide,
  complexExp,
  complexLn,
  complexPlus,
  complexSin,
  complexSinh,
  complexTan,
  complexTanh,
  complexTimes,
  readComplex,
  writeComplex,
  type Complex,
  type ImaginaryUnit,
} from '../complex';
import { err, isError, toNumber, type Scalar, type SheetError, type Value } from '../values';

const NO_RESULT = err('#NUM!', 'This has no complex result');
const MIXED_UNITS = err('#VALUE!', 'Complex numbers with i and with j cannot be combined');

// The unit a value names: text ending in i or j names it; a number names none.
function namedUnit(v: Scalar): ImaginaryUnit | null {
  if (typeof v !== 'string') return null;
  const last = v.trim().at(-1);
  return last === 'i' || last === 'j' ? last : null;
}

// Values read as complex numbers of one unit: the unit any of them names (i when none does), two names #VALUE!.
function complexes(values: Scalar[]): Complex[] | SheetError {
  let unit: ImaginaryUnit | null = null;
  const out: Complex[] = [];
  for (const v of values) {
    const c = readComplex(v);
    if (isError(c)) return c;
    const named = namedUnit(v);
    if (named && unit && named !== unit) return MIXED_UNITS;
    unit = named ?? unit;
    out.push(c);
  }
  return out.map((c) => ({ ...c, unit: unit ?? 'i' }));
}

// A function of one complex number to a value.
function unary(each: (c: Complex) => Value): FnDef {
  return scalarFn(1, 1, ([x]) => {
    const c = readComplex(x!);
    return isError(c) ? c : each(c);
  });
}

// A function of one complex number to another, none (a pole, a logarithm of 0) being #NUM!.
function complexFn(each: (c: Complex) => Complex | null): FnDef {
  return unary((c) => {
    const out = each(c);
    return out && Number.isFinite(out.re) && Number.isFinite(out.im)
      ? writeComplex(out)
      : NO_RESULT;
  });
}

const ONE = (c: Complex): Complex => ({ re: 1, im: 0, unit: c.unit });
const over = (top: (c: Complex) => Complex, bottom: (c: Complex) => Complex) => (c: Complex) =>
  complexDivide(top(c), bottom(c));
const scaled = (c: Complex | null, k: number): Complex | null =>
  c && { re: c.re / k, im: c.im / k, unit: c.unit };

// The functions over every value of their arguments: IMSUM and IMPRODUCT.
function folding(start: Complex, step: (a: Complex, b: Complex) => Complex): FnDef {
  return fn(1, MANY, (args, f) => {
    const cs = complexes(flatScalars(args, f));
    if (isError(cs)) return cs;
    return writeComplex(cs.reduce(step, { ...start, unit: cs[0]!.unit }));
  });
}

// A function of two complex numbers of one unit, lifted over arrays.
function binary(each: (a: Complex, b: Complex) => Complex | null): FnDef {
  return scalarFn(2, 2, (xs) => {
    const both = complexes(xs);
    if (isError(both)) return both;
    const out = each(both[0]!, both[1]!);
    return out ? writeComplex(out) : NO_RESULT;
  });
}

export const ENGINEERING_COMPLEX_FUNCTIONS: Record<string, FnDef> = {
  // The suffix is i or j, i by default.
  COMPLEX: fn(2, 3, (args, f) => {
    const re = numArg(args[0]!, f);
    const im = numArg(args[1]!, f);
    const suffix = opt(args, 2, f, textArg, 'i');
    if (isError(re)) return re;
    if (isError(im)) return im;
    if (isError(suffix)) return suffix;
    const unit = suffix === '' ? 'i' : suffix;
    if (unit !== 'i' && unit !== 'j') return err('#VALUE!', 'The suffix is "i" or "j"');
    return writeComplex({ re, im, unit });
  }),
  IMREAL: unary((c) => c.re),
  IMAGINARY: unary((c) => c.im),
  IMABS: unary((c) => Math.hypot(c.re, c.im)),
  IMARGUMENT: unary((c) =>
    c.re === 0 && c.im === 0 ? err('#DIV/0!', '0 has no argument') : Math.atan2(c.im, c.re),
  ),
  IMCONJUGATE: complexFn((c) => ({ ...c, im: -c.im })),
  IMSUM: folding({ re: 0, im: 0, unit: 'i' }, complexPlus),
  IMPRODUCT: folding({ re: 1, im: 0, unit: 'i' }, complexTimes),
  IMSUB: binary((a, b) => complexPlus(a, { ...b, re: -b.re, im: -b.im })),
  IMDIV: binary(complexDivide),
  IMEXP: complexFn(complexExp),
  IMLOG10: complexFn((c) => scaled(complexLn(c), Math.LN10)),
  IMLOG2: complexFn((c) => scaled(complexLn(c), Math.LN2)),
  // A logarithm to any positive base but 1.
  IMLOG: scalarFn(2, 2, ([x, b], f) => {
    const c = readComplex(x!);
    const base = toNumber(b!, f.locale);
    if (isError(c)) return c;
    if (isError(base)) return base;
    if (base <= 0 || base === 1) return err('#NUM!', 'The base is a positive number other than 1');
    const out = scaled(complexLn(c), Math.log(base));
    return out ? writeComplex(out) : NO_RESULT;
  }),
  IMSIN: complexFn(complexSin),
  IMCOS: complexFn(complexCos),
  IMTAN: complexFn(complexTan),
  IMCOT: complexFn(complexCot),
  IMSEC: complexFn(over(ONE, complexCos)),
  IMCSC: complexFn(over(ONE, complexSin)),
  IMSINH: complexFn(complexSinh),
  IMCOSH: complexFn(complexCosh),
  IMTANH: complexFn(complexTanh),
  IMCOTH: complexFn(complexCoth),
  IMSECH: complexFn(over(ONE, complexCosh)),
  IMCSCH: complexFn(over(ONE, complexSinh)),
};
