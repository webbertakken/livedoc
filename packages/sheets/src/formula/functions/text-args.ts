// How text functions read their arguments (docs/specs/029-sheets/formulas.md "Functions": Text).
import { fn, lift, valueArg, type FnDef } from '../fn';
import { isError, toNumber, toText, type Scalar, type Value } from '../values';
import { boundedText } from '../operators';

export function texts(xs: Scalar[], locale: string): string[] | Value {
  const out: string[] = [];
  for (const x of xs) {
    const t = toText(x, locale);
    if (isError(t)) return t;
    out.push(t);
  }
  return out;
}

// A text function of fixed arguments: the first `nText` read as text, the rest as numbers (absent ones undefined).
// Only an argument left out (`LEFT(A1,)`) is absent: a reference to an empty cell reads as 0, as in Excel and Sheets.
export function textFn(
  min: number,
  max: number,
  nText: number,
  each: (ts: string[], ns: (number | undefined)[]) => Value,
): FnDef {
  return fn(min, max, (args, f) => {
    const skipped = args.map((a) => a === null);
    return lift(
      args.map((a) => valueArg(a, f)),
      (xs) => textEach(xs, { skipped, min, nText, locale: f.locale }, each),
    );
  });
}

// How textEach reads: the first `nText` as text, an argument left out past `min` as absent, in `locale`.
export type TextReading = { skipped: boolean[]; min: number; nText: number; locale: string };

export function textEach(
  xs: Scalar[],
  { skipped, min, nText, locale }: TextReading,
  each: (ts: string[], ns: (number | undefined)[]) => Value,
): Value {
  const ts: string[] = [];
  const ns: (number | undefined)[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!;
    if (i < nText) {
      const t = toText(x, locale);
      if (isError(t)) return t;
      ts.push(t);
    } else if (skipped[i] && i >= min) {
      ns.push(undefined);
    } else {
      const n = toNumber(x, locale);
      if (typeof n !== 'number') return n;
      ns.push(n);
    }
  }
  const out = each(ts, ns);
  return typeof out === 'string' ? boundedText(out) : out;
}
