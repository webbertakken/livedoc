// The REGEX functions (docs/specs/029-sheets/formulas.md "Functions": Text), on RE2 patterns as Google's are.
import { fn, lift, valueArg, type FnDef } from '../fn';
import { applyReplacement, parseReplacement } from '../re2/re2-replace';
import { err, isError, type Value } from '../values';
import { textEach } from './text-args';
import { re2 } from './text-patterns';

// A REGEX function: its text must be text, not a number, as Google's are.
function regexFn(n: number, each: (ts: string[]) => Value): FnDef {
  return fn(n, n, (args, f) =>
    lift(
      args.map((a) => valueArg(a, f)),
      (xs) =>
        typeof xs[0] === 'number'
          ? err('#VALUE!', 'A regular expression reads text, not a number')
          : textEach(xs, { skipped: [], min: n, nText: n, locale: f.locale }, (ts) => each(ts)),
    ),
  );
}

export const REGEX_TEXT_FUNCTIONS: Record<string, FnDef> = {
  REGEXMATCH: regexFn(2, ([t, p]) => {
    const compiled = re2('REGEXMATCH', p!, t!);
    return isError(compiled) ? compiled : compiled.re.test(t!);
  }),
  // The whole match, or its capture groups, one column each; a group that took no part is empty text.
  REGEXEXTRACT: regexFn(2, ([t, p]) => {
    const compiled = re2('REGEXEXTRACT', p!, t!);
    if (isError(compiled)) return compiled;
    const m = compiled.re.exec(t!);
    if (!m) return err('#N/A', 'The pattern did not match');
    if (m.length === 1) return m[0];
    if (m.length === 2) return m[1] ?? '';
    return { rows: [m.slice(1).map((g) => g ?? '')] };
  }),
  REGEXREPLACE: regexFn(3, ([t, p, by]) => {
    const compiled = re2('REGEXREPLACE', p!, t!, true);
    if (isError(compiled)) return compiled;
    const parts = parseReplacement(by!, compiled.groups);
    if ('missing' in parts)
      return compiled.re.test(t!)
        ? err(
            '#N/A',
            parts.missing === null
              ? 'A $ in the replacement names no group'
              : `The replacement names group $${parts.missing}, which the pattern lacks`,
          )
        : t!;
    return t!.replace(compiled.re, (...m: unknown[]) =>
      applyReplacement(parts, m.slice(0, compiled.groups + 1) as (string | undefined)[]),
    );
  }),
};
