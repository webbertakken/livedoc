// The continuous distributions (docs/specs/029-sheets/formulas.md "Functions": Statistics): normal, log-normal,
// exponential, Weibull, gamma, beta, chi-squared, F and Student's t, each with its inverse where Google has one.
import {
  betaLn,
  betaRegularized,
  fisherLower,
  fisherUpper,
  gamma,
  gammaLower,
  gammaUpper,
  invert,
  normalCdf,
  normalInverse,
  normalPdf,
  studentUpper,
} from '../distributions';
import type { Frame } from '../../engine/frame';
import { numFn, type FnDef } from '../fn';
import { gammaLn } from '../special-functions';
import { isError, type SheetError, type Value } from '../values';
import {
  OUT_OF_DOMAIN,
  degrees,
  lowerTailProbability,
  openProbability,
  positive,
  upperTailProbability,
} from './distribution-args';

type Check = number | SheetError;

// The first refusal among the checked arguments, else the answer.
function checked(checks: Check[], answer: (ns: number[]) => Value): Value {
  for (const c of checks) if (isError(c)) return c;
  return answer(checks as number[]);
}

const NEGATIVE_X = OUT_OF_DOMAIN('x cannot be negative');
const NO_LOGARITHM = OUT_OF_DOMAIN('x must be above 0');

// Whether a function OpenFormula names (EXPONDIST, LOGNORMDIST, BETADIST, BETAINV) answers as OpenFormula: in that
// meaning, where Google refuses a value OpenFormula defines (the file's meaning). Excel's names answer as Google's.
const asOpenFormula = (openFormulaName: boolean, f: Frame): boolean =>
  openFormulaName && f.meaning === 'openformula';
const INFINITE_DENSITY = OUT_OF_DOMAIN('The density is infinite at 0');

// The x of a distribution on [0, ∞) whose lower tail (or upper, `fromAbove`) is p, found from whichever tail p
// is nearer, so a small upper tail keeps its digits.
function inverse(
  lower: (x: number) => number,
  upper: (x: number) => number,
  p: number,
  fromAbove = false,
): number {
  const [tail, rising] = fromAbove ? [upper, false] : [lower, true];
  const [other, otherRising] = fromAbove ? [lower, true] : [upper, false];
  return p < 0.5
    ? invert(tail, p, rising, 0, Infinity)
    : invert(other, 1 - p, otherRising, 0, Infinity);
}

// Gamma(α, β): its density and tails.
function gammaPdf(x: number, a: number, b: number): number {
  return Math.exp((a - 1) * Math.log(x) - x / b - gammaLn(a) - a * Math.log(b));
}

function gammaDist(x: number, a: number, b: number, cumulative: boolean): Value {
  if (x < 0) return NEGATIVE_X;
  if (cumulative) return gammaLower(a, x / b);
  if (x > 0) return gammaPdf(x, a, b);
  // At 0 Google's help refuses a shape of at most 1 (where the density is 1/β or infinite); above it, 0.
  return a <= 1 ? OUT_OF_DOMAIN('x must be above 0 for this shape') : 0;
}

const gammaInverse = (p: number, a: number, b: number, fromAbove = false): number =>
  b *
  inverse(
    (x) => gammaLower(a, x),
    (x) => gammaUpper(a, x),
    p,
    fromAbove,
  );

// Student's t with ν degrees of freedom: its lower tail and density.
const tUpper = studentUpper;

function tCdf(t: number, v: number): number {
  return t < 0 ? tUpper(-t, v) : 1 - tUpper(t, v);
}

function tPdf(t: number, v: number): number {
  return Math.exp(
    -((v + 1) / 2) * Math.log1p((t * t) / v) - 0.5 * Math.log(v) - betaLn(v / 2, 0.5),
  );
}

// The t ≥ 0 whose upper tail is q (q ≤ 0.5).
const tInverseUpper = (q: number, v: number): number =>
  invert((t) => tUpper(t, v), q, false, 0, Infinity);

function tInverse(p: number, v: number): number {
  return p < 0.5 ? -tInverseUpper(p, v) : tInverseUpper(1 - p, v);
}

// F(d1, d2): its tails and density.
const fLower = fisherLower;
const fUpper = fisherUpper;

function fDensity(x: number, d1: number, d2: number): Value {
  if (x === 0) return d1 === 1 ? INFINITE_DENSITY : d1 === 2 ? 1 : 0;
  const logs =
    (d1 / 2) * Math.log((d1 * x) / (d1 * x + d2)) +
    (d2 / 2) * Math.log(d2 / (d1 * x + d2)) -
    Math.log(x) -
    betaLn(d1 / 2, d2 / 2);
  return Math.exp(logs);
}

const fInverse = (p: number, d1: number, d2: number, fromAbove = false): number =>
  inverse(
    (x) => fLower(x, d1, d2),
    (x) => fUpper(x, d1, d2),
    p,
    fromAbove,
  );

const chiInverse = (p: number, v: number, fromAbove = false): number =>
  gammaInverse(p, v / 2, 2, fromAbove);

// Beta(α, β) over [A, B].
function betaDist(
  x: number,
  a: number,
  b: number,
  lo: number,
  hi: number,
  cumulative: boolean,
): number {
  const z = (x - lo) / (hi - lo);
  if (cumulative) return betaRegularized(z, a, b);
  return Math.exp((a - 1) * Math.log(z) + (b - 1) * Math.log1p(-z) - betaLn(a, b)) / (hi - lo);
}

function betaInverse(p: number, a: number, b: number, lo: number, hi: number): number {
  const z =
    p < 0.5
      ? invert((x) => betaRegularized(x, a, b), p, true, 0, 1)
      : invert((x) => betaRegularized(1 - x, b, a), 1 - p, false, 0, 1);
  return lo + z * (hi - lo);
}

function bounds(lo: number, hi: number): Check {
  return lo < hi ? lo : OUT_OF_DOMAIN('The lower bound must be below the upper bound');
}

const normal = numFn(4, 4, ([x, m, s, c]) =>
  checked([positive(s!, 'The standard deviation')], () => {
    const z = (x! - m!) / s!;
    return c ? normalCdf(z) : normalPdf(z) / s!;
  }),
);
const normalInv = numFn(3, 3, ([p, m, s]) =>
  checked(
    [openProbability(p!), positive(s!, 'The standard deviation')],
    () => m! + s! * normalInverse(p!),
  ),
);
const standardNormal = numFn(1, 2, ([z, c = 1]) => (c ? normalCdf(z!) : normalPdf(z!)));
const standardNormalInv = numFn(1, 1, ([p]) =>
  checked([openProbability(p!)], () => normalInverse(p!)),
);
// x ≤ 0 has no logarithm: Google refuses it; OpenFormula's LOGNORMDIST gives no probability below it and no density
// (Part 4 §6.18.44).
const logNormal = (openFormulaName: boolean): FnDef =>
  numFn(3, 4, ([x, m, s, c = 1], f) =>
    checked([positive(s!, 'The standard deviation')], () => {
      if (x! <= 0) return asOpenFormula(openFormulaName, f) ? 0 : NO_LOGARITHM;
      const z = (Math.log(x!) - m!) / s!;
      return c ? normalCdf(z) : normalPdf(z) / (s! * x!);
    }),
  );
const logNormalInv = numFn(3, 3, ([p, m, s]) =>
  checked([openProbability(p!), positive(s!, 'The standard deviation')], () =>
    Math.exp(m! + s! * normalInverse(p!)),
  ),
);
// Below 0 Google refuses x; OpenFormula's EXPONDIST gives no probability and no density there (Part 4 §6.18.21).
const exponential = (openFormulaName: boolean): FnDef =>
  numFn(3, 3, ([x, l, c], f) =>
    checked([positive(l!, 'LAMBDA')], () => {
      if (x! < 0) return asOpenFormula(openFormulaName, f) ? 0 : NEGATIVE_X;
      return c ? -Math.expm1(-l! * x!) : l! * Math.exp(-l! * x!);
    }),
  );
const weibull = numFn(4, 4, ([x, k, l, c]) =>
  checked([x! < 0 ? NEGATIVE_X : x!, positive(k!, 'The shape'), positive(l!, 'The scale')], () => {
    const r = (x! / l!) ** k!;
    if (c) return -Math.expm1(-r);
    if (x === 0) return k === 1 ? 1 / l! : k! < 1 ? INFINITE_DENSITY : 0;
    return (k! / l!) * (x! / l!) ** (k! - 1) * Math.exp(-r);
  }),
);
const gammaDistFn = numFn(4, 4, ([x, a, b, c]) =>
  checked([positive(a!, 'alpha'), positive(b!, 'beta')], () => gammaDist(x!, a!, b!, c !== 0)),
);
const gammaInv = numFn(3, 3, ([p, a, b]) =>
  checked(
    [
      p! < 0 || p! >= 1 ? OUT_OF_DOMAIN('The probability must be from 0 to below 1') : p!,
      positive(a!, 'alpha'),
      positive(b!, 'beta'),
    ],
    () => (p === 0 ? 0 : gammaInverse(p!, a!, b!)),
  ),
);
// BETA.DIST is Excel's: cumulative fourth and x within the bounds. BETADIST is OpenFormula's: cumulative last
// (TRUE by default); outside the bounds Google refuses x, OpenFormula gives 0 below and 1 (or density 0) above.
const betaDistFn = numFn(4, 6, ([x, a, b, c, lo = 0, hi = 1]) =>
  checked([positive(a!, 'alpha'), positive(b!, 'beta'), bounds(lo, hi)], () =>
    x! < lo || x! > hi
      ? OUT_OF_DOMAIN('The value must be within the bounds')
      : betaDist(x!, a!, b!, lo, hi, c !== 0),
  ),
);
const betaDistLegacy = numFn(3, 6, ([x, a, b, lo = 0, hi = 1, c = 1], f) =>
  checked([positive(a!, 'alpha'), positive(b!, 'beta'), bounds(lo, hi)], () => {
    if ((x! < lo || x! > hi) && f.meaning !== 'openformula')
      return OUT_OF_DOMAIN('The value must be within the bounds');
    if (x! < lo) return 0;
    if (x! > hi) return c ? 1 : 0;
    return betaDist(x!, a!, b!, lo, hi, c !== 0);
  }),
);
// Google takes a probability above 0 to 1; OpenFormula's BETAINV from 0 (Part 4 §6.18.8).
const betaInv = (openFormulaName: boolean): FnDef =>
  numFn(3, 5, ([p, a, b, lo = 0, hi = 1], f) =>
    checked(
      [
        p! < 0 || p! > 1 || (p === 0 && !asOpenFormula(openFormulaName, f))
          ? OUT_OF_DOMAIN('The probability must be above 0 to 1')
          : p!,
        positive(a!, 'alpha'),
        positive(b!, 'beta'),
        bounds(lo, hi),
      ],
      () => (p === 0 ? lo : p === 1 ? hi : betaInverse(p!, a!, b!, lo, hi)),
    ),
  );
// χ²(ν) is Gamma(ν/2, 2). At 0 Google's density is 0, but for ν = 2 (where it is 1/2) no answer (measured).
const chiDist = numFn(3, 3, ([x, v, c]) =>
  checked([degrees(v!)], ([n]) => {
    if (x === 0 && c === 0) return n === 2 ? OUT_OF_DOMAIN('No density at 0 for 2 degrees') : 0;
    return gammaDist(x!, n! / 2, 2, c !== 0);
  }),
);
// OpenFormula's CHISQDIST: cumulative unless told otherwise, and 0 at or below 0 (its density too).
const chiDistOpen = numFn(2, 3, ([x, v, c = 1]) =>
  checked([degrees(v!)], ([n]) => {
    if (x! <= 0) return 0;
    return c ? gammaLower(n! / 2, x! / 2) : gammaPdf(x!, n! / 2, 2);
  }),
);
// CHISQ.INV, and OpenFormula's CHISQINV: a probability from 0 to below 1.
const chiInv = numFn(2, 2, ([p, v]) =>
  checked([lowerTailProbability(p!), degrees(v!)], ([q, n]) => (q === 0 ? 0 : chiInverse(q!, n!))),
);
const chiDistRight = numFn(2, 2, ([x, v]) =>
  checked([x! < 0 ? NEGATIVE_X : x!, degrees(v!)], ([, n]) => gammaUpper(n! / 2, x! / 2)),
);
const chiInvRight = numFn(2, 2, ([p, v]) =>
  checked([upperTailProbability(p!), degrees(v!)], ([q, n]) =>
    q === 1 ? 0 : chiInverse(q!, n!, true),
  ),
);
// Google refuses F.DIST without its cumulative, as Excel; OpenFormula's FDIST is cumulative when it is left out (D38).
const fDist = numFn(3, 4, ([x, a, b, c = 1]) => {
  const cumulative = c !== 0;
  return checked([x! < 0 ? NEGATIVE_X : x!, degrees(a!), degrees(b!)], ([, d1, d2]) =>
    cumulative ? fLower(x!, d1!, d2!) : fDensity(x!, d1!, d2!),
  );
});
const fDistRight = numFn(3, 3, ([x, a, b]) =>
  checked([x! < 0 ? NEGATIVE_X : x!, degrees(a!), degrees(b!)], ([, d1, d2]) =>
    fUpper(x!, d1!, d2!),
  ),
);
const fInv = numFn(3, 3, ([p, a, b]) =>
  checked([lowerTailProbability(p!), degrees(a!), degrees(b!)], ([q, d1, d2]) =>
    q === 0 ? 0 : fInverse(q!, d1!, d2!),
  ),
);
const fInvRight = numFn(3, 3, ([p, a, b]) =>
  checked([upperTailProbability(p!), degrees(a!), degrees(b!)], ([q, d1, d2]) =>
    q === 1 ? 0 : fInverse(q!, d1!, d2!, true),
  ),
);
const tDist = numFn(3, 3, ([x, v, c]) =>
  checked([degrees(v!)], ([n]) => (c ? tCdf(x!, n!) : tPdf(x!, n!))),
);
const tDistRight = numFn(2, 2, ([x, v]) => checked([degrees(v!)], ([n]) => tCdf(-x!, n!)));
const tDistTwo = numFn(2, 2, ([x, v]) =>
  checked([x! < 0 ? NEGATIVE_X : x!, degrees(v!)], ([, n]) => 2 * tUpper(x!, n!)),
);
const tDistLegacy = numFn(3, 3, ([x, v, tails]) =>
  checked(
    [
      x! < 0 ? NEGATIVE_X : x!,
      degrees(v!),
      Math.trunc(tails!) === 1 || Math.trunc(tails!) === 2
        ? Math.trunc(tails!)
        : OUT_OF_DOMAIN('tails is 1 or 2'),
    ],
    ([, n, k]) => k! * tUpper(x!, n!),
  ),
);
const tInv = numFn(2, 2, ([p, v]) =>
  checked([openProbability(p!), degrees(v!)], ([q, n]) => tInverse(q!, n!)),
);
const tInvTwo = numFn(2, 2, ([p, v]) =>
  checked([upperTailProbability(p!), degrees(v!)], ([q, n]) =>
    q === 1 ? 0 : tInverseUpper(q! / 2, n!),
  ),
);

export const DISTRIBUTION_FUNCTIONS: Record<string, FnDef> = {
  'NORM.DIST': normal,
  NORMDIST: normal,
  'NORM.INV': normalInv,
  NORMINV: normalInv,
  'NORM.S.DIST': standardNormal,
  // NORMSDIST has no cumulative, as Excel's and OpenFormula's LEGACY.NORMSDIST.
  NORMSDIST: numFn(1, 1, ([z]) => normalCdf(z!)),
  'NORM.S.INV': standardNormalInv,
  NORMSINV: standardNormalInv,
  PHI: numFn(1, 1, ([x]) => normalPdf(x!)),
  GAUSS: numFn(1, 1, ([z]) => normalCdf(z!) - 0.5),
  'LOGNORM.DIST': logNormal(false),
  LOGNORMDIST: logNormal(true),
  'LOGNORM.INV': logNormalInv,
  LOGINV: logNormalInv,
  'EXPON.DIST': exponential(false),
  EXPONDIST: exponential(true),
  WEIBULL: weibull,
  'WEIBULL.DIST': weibull,
  // Google's help: the number must be positive.
  GAMMA: numFn(1, 1, ([x]) => checked([positive(x!, 'The number')], () => gamma(x!))),
  'GAMMA.DIST': gammaDistFn,
  GAMMADIST: gammaDistFn,
  'GAMMA.INV': gammaInv,
  GAMMAINV: gammaInv,
  'BETA.DIST': betaDistFn,
  BETADIST: betaDistLegacy,
  'BETA.INV': betaInv(false),
  BETAINV: betaInv(true),
  'CHISQ.DIST': chiDist,
  'CHISQ.DIST.RT': chiDistRight,
  CHIDIST: chiDistRight,
  'CHISQ.INV': chiInv,
  CHISQDIST: chiDistOpen,
  CHISQINV: chiInv,
  'CHISQ.INV.RT': chiInvRight,
  CHIINV: chiInvRight,
  'F.DIST': fDist,
  'F.DIST.RT': fDistRight,
  FDIST: fDistRight,
  'F.INV': fInv,
  'F.INV.RT': fInvRight,
  FINV: fInvRight,
  'T.DIST': tDist,
  'T.DIST.RT': tDistRight,
  'T.DIST.2T': tDistTwo,
  TDIST: tDistLegacy,
  'T.INV': tInv,
  'T.INV.2T': tInvTwo,
  TINV: tInvTwo,
};
