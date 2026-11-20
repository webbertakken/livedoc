// Complex numbers as spreadsheets write them (docs/specs/029-sheets/formulas.md "Complex numbers"): text such as
// `3+4i` or `2-j`, or a plain number. Read, worked in polar form, and written back with the input's suffix.
import { err, isError, type Scalar, type SheetError } from './values';

export type ImaginaryUnit = 'i' | 'j';

export type Complex = { re: number; im: number; unit: ImaginaryUnit };

const NOT_COMPLEX = 'This is not a complex number';
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

// A coefficient written before the unit: empty or a lone sign is 1 or -1.
function coefficient(text: string): number | null {
  if (text === '' || text === '+') return 1;
  if (text === '-') return -1;
  return DECIMAL.test(text) ? Number(text) : null;
}

/** A value read as a complex number: a number is real, text is `a`, `bi`, `a+bi` or `a-bi` with i or j. */
export function readComplex(v: Scalar): Complex | SheetError {
  if (isError(v)) return v;
  if (typeof v === 'number') return { re: v, im: 0, unit: 'i' };
  if (typeof v !== 'string') return err('#VALUE!', NOT_COMPLEX);
  const text = v.trim();
  const last = text.at(-1);
  if (last !== 'i' && last !== 'j') {
    return DECIMAL.test(text) ? { re: Number(text), im: 0, unit: 'i' } : err('#NUM!', NOT_COMPLEX);
  }
  const body = text.slice(0, -1);
  // The imaginary part starts at the last sign that is neither the first character nor an exponent's.
  let split = -1;
  for (let k = body.length - 1; k > 0; k--) {
    if ((body[k] === '+' || body[k] === '-') && !/[eE]/.test(body[k - 1]!)) {
      split = k;
      break;
    }
  }
  const re =
    split < 0 ? 0 : DECIMAL.test(body.slice(0, split)) ? Number(body.slice(0, split)) : null;
  const im = coefficient(split < 0 ? body : body.slice(split));
  if (re === null || im === null) return err('#NUM!', NOT_COMPLEX);
  return { re, im, unit: last };
}

// A part to 15 significant digits, as a spreadsheet writes it: 65, not 65.00000000000001.
function part(x: number): string {
  return String(Number(x.toPrecision(15)));
}

/** A complex number as text: `a+bi`, `a`, `bi`, with `i` for 1i. */
export function writeComplex(c: Complex): string {
  const re = Number(c.re.toPrecision(15));
  const im = Number(c.im.toPrecision(15));
  if (im === 0) return part(re);
  const imText = im === 1 ? '' : im === -1 ? '-' : part(im);
  if (re === 0) return `${imText}${c.unit}`;
  return `${part(re)}${im > 0 ? '+' : ''}${imText}${c.unit}`;
}

/** The principal natural logarithm; none for 0. */
export function complexLn(c: Complex): Complex | null {
  if (c.re === 0 && c.im === 0) return null;
  return { re: Math.log(Math.hypot(c.re, c.im)), im: Math.atan2(c.im, c.re), unit: c.unit };
}

function times(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re, unit: a.unit };
}

// Whole powers up to this are multiplied out, exactly where the parts are whole: (5+2i)³ is 65+142i, not
// 64.99999999999997+142i as the polar form gives.
const MULTIPLIED_POWER_MAX = 1024;

/** c raised to a real power; none for 0 to a power of 0 or less. */
export function complexPower(c: Complex, n: number): Complex | null {
  if (c.re === 0 && c.im === 0) return n > 0 ? { re: 0, im: 0, unit: c.unit } : null;
  if (Number.isInteger(n) && Math.abs(n) <= MULTIPLIED_POWER_MAX) {
    let out: Complex = { re: 1, im: 0, unit: c.unit };
    let base = c;
    for (let k = Math.abs(n); k > 0; k >>= 1) {
      if (k & 1) out = times(out, base);
      base = times(base, base);
    }
    if (n >= 0) return out;
    const d = out.re * out.re + out.im * out.im;
    return { re: out.re / d, im: -out.im / d, unit: c.unit };
  }
  const r = Math.hypot(c.re, c.im) ** n;
  const theta = Math.atan2(c.im, c.re) * n;
  return { re: r * Math.cos(theta), im: r * Math.sin(theta), unit: c.unit };
}

/** The principal square root, by halves of the modulus, so √-4 is exactly 2i. */
export function complexSqrt(c: Complex): Complex {
  const m = Math.hypot(c.re, c.im);
  const re = Math.sqrt((m + c.re) / 2);
  const im = Math.sqrt((m - c.re) / 2);
  return { re, im: c.im < 0 ? -im : im, unit: c.unit };
}

/** a + b. */
export function complexPlus(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im, unit: a.unit };
}

/** a × b. */
export function complexTimes(a: Complex, b: Complex): Complex {
  return times(a, b);
}

/** a ÷ b; none for b of 0. */
export function complexDivide(a: Complex, b: Complex): Complex | null {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return null;
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
    unit: a.unit,
  };
}

/** e to the power c. */
export function complexExp(c: Complex): Complex {
  const r = Math.exp(c.re);
  return { re: r * Math.cos(c.im), im: r * Math.sin(c.im), unit: c.unit };
}

/** The sine, cosine, hyperbolic sine and hyperbolic cosine; the others are their quotients. */
export function complexSin(c: Complex): Complex {
  return {
    re: Math.sin(c.re) * Math.cosh(c.im),
    im: Math.cos(c.re) * Math.sinh(c.im),
    unit: c.unit,
  };
}

export function complexCos(c: Complex): Complex {
  return {
    re: Math.cos(c.re) * Math.cosh(c.im),
    im: -Math.sin(c.re) * Math.sinh(c.im),
    unit: c.unit,
  };
}

export function complexSinh(c: Complex): Complex {
  return {
    re: Math.sinh(c.re) * Math.cos(c.im),
    im: Math.cosh(c.re) * Math.sin(c.im),
    unit: c.unit,
  };
}

export function complexCosh(c: Complex): Complex {
  return {
    re: Math.cosh(c.re) * Math.cos(c.im),
    im: Math.sinh(c.re) * Math.sin(c.im),
    unit: c.unit,
  };
}

// Tangents by double angles, which keep a small part exact where sine over cosine would cancel:
// tan(a+bi) = (sin 2a + i sinh 2b) / (cos 2a + cosh 2b), tanh(a+bi) = (sinh 2a + i sin 2b) / (cosh 2a + cos 2b).
// Each is none at a pole.
function quotient(re: number, im: number, d: number, unit: ImaginaryUnit): Complex | null {
  return d === 0 ? null : { re: re / d, im: im / d, unit };
}

export function complexTan(c: Complex): Complex | null {
  const [a, b] = [2 * c.re, 2 * c.im];
  return quotient(Math.sin(a), Math.sinh(b), Math.cos(a) + Math.cosh(b), c.unit);
}

export function complexCot(c: Complex): Complex | null {
  const [a, b] = [2 * c.re, 2 * c.im];
  return quotient(Math.sin(a), -Math.sinh(b), Math.cosh(b) - Math.cos(a), c.unit);
}

export function complexTanh(c: Complex): Complex | null {
  const [a, b] = [2 * c.re, 2 * c.im];
  return quotient(Math.sinh(a), Math.sin(b), Math.cosh(a) + Math.cos(b), c.unit);
}

export function complexCoth(c: Complex): Complex | null {
  const [a, b] = [2 * c.re, 2 * c.im];
  return quotient(Math.sinh(a), -Math.sin(b), Math.cosh(a) - Math.cos(b), c.unit);
}
