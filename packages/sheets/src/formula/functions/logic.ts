// Logic functions (docs/specs/029-sheets/formulas.md "Functions": Logic). IF, IFS, SWITCH, IFERROR and IFNA are
// lazy: the branch not taken is never worked out.
import type { EvalValue, Frame } from '../../engine/frame';
import {
  MANY,
  deref,
  flatScalars,
  fn,
  lazyFn,
  lift,
  scalarFn,
  type FnDef,
  type Thunk,
} from '../fn';
import { compareScalars, err, isArray, isError, scalarOf, toBool, type Value } from '../values';

function boolsOf(args: EvalValue[], f: Frame): boolean[] | Value {
  const out: boolean[] = [];
  for (const x of flatScalars(args, f)) {
    if (isError(x)) return x;
    if (typeof x === 'boolean') out.push(x);
    else if (typeof x === 'number') out.push(x !== 0);
    else if (typeof x === 'string') {
      const l = x.toLowerCase();
      if (l === 'true' || l === 'false') out.push(l === 'true');
    }
  }
  if (out.length === 0) return err('#VALUE!', 'There are no TRUE or FALSE values');
  return out;
}

function whenArray(cond: Value, then: Thunk, otherwise: Thunk | null, f: Frame): Value {
  const a = deref(then(), f);
  const b = otherwise ? deref(otherwise(), f) : false;
  return lift([cond, a, b], ([c, x, y]) => {
    const t = toBool(c!);
    if (isError(t)) return t;
    return t ? x! : y!;
  });
}

// IFERROR and IFNA: the value, or the fallback where it is caught. IFERROR's fallback is optional, blank by default
// (Google's); IFNA's is not.
function caught(test: (v: Value) => boolean, min: 1 | 2): FnDef {
  return lazyFn(min, 2, ([value, fallback], f) => {
    const v = deref(value!(), f);
    const otherwise = fallback ?? (() => null);
    if (isArray(v)) return lift([v, deref(otherwise(), f)], ([x, y]) => (test(x!) ? y! : x!));
    return test(v) ? otherwise() : v;
  });
}

export const LOGIC_FUNCTIONS: Record<string, FnDef> = {
  IF: lazyFn(2, 3, ([cond, then, otherwise], f) => {
    const c = deref(cond!(), f);
    if (isArray(c)) return whenArray(c, then!, otherwise ?? null, f);
    const t = toBool(c);
    if (isError(t)) return t;
    if (t) return then!();
    return otherwise ? otherwise() : false;
  }),
  IFS: lazyFn(2, MANY, (args, f) => {
    if (args.length % 2 !== 0) return err('#N/A', 'IFS takes pairs of condition and value');
    for (let i = 0; i < args.length; i += 2) {
      const t = toBool(deref(args[i]!(), f));
      if (isError(t)) return t;
      if (t) return args[i + 1]!();
    }
    return err('#N/A', 'No condition was TRUE');
  }),
  SWITCH: lazyFn(3, MANY, (args, f) => {
    const subject = scalarOf(deref(args[0]!(), f));
    if (isError(subject)) return subject;
    let i = 1;
    for (; i + 1 < args.length; i += 2) {
      const c = scalarOf(deref(args[i]!(), f));
      if (isError(c)) return c;
      if (typeof c === typeof subject && compareScalars(c, subject) === 0) return args[i + 1]!();
    }
    return i < args.length ? args[i]!() : err('#N/A', 'No case matched');
  }),
  AND: fn(1, MANY, (args, f) => {
    const bs = boolsOf(args, f);
    return Array.isArray(bs) ? bs.every(Boolean) : bs;
  }),
  OR: fn(1, MANY, (args, f) => {
    const bs = boolsOf(args, f);
    return Array.isArray(bs) ? bs.some(Boolean) : bs;
  }),
  XOR: fn(1, MANY, (args, f) => {
    const bs = boolsOf(args, f);
    return Array.isArray(bs) ? bs.filter(Boolean).length % 2 === 1 : bs;
  }),
  NOT: scalarFn(1, 1, ([x]) => {
    const t = toBool(x!);
    return isError(t) ? t : !t;
  }),
  TRUE: fn(0, 0, () => true),
  FALSE: fn(0, 0, () => false),
  IFERROR: caught((v) => isError(v), 1),
  IFNA: caught((v) => isError(v) && v.e === '#N/A', 2),
};
