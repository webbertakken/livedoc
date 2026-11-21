// Sets of code points, the form every RE2 class takes before it is written as JavaScript (formulas.md "Text": the
// RE2 bullets). A set is a flat, sorted list of inclusive ranges, [lo0, hi0, lo1, hi1, ...], none touching another.
// Negation and case folding work on the set, so the class written out is always a plain positive one. Pure.

export type CodeSet = readonly number[];

export const MAX_CODE_POINT = 0x10ffff;

/** The set of the given ranges, sorted and merged. */
export function codeSet(ranges: readonly (readonly [number, number])[]): CodeSet {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (const [lo, hi] of sorted) {
    const last = out.length - 1;
    if (last > 0 && lo <= out[last]! + 1) out[last] = Math.max(out[last]!, hi);
    else out.push(lo, hi);
  }
  return out;
}

export const charSet = (cp: number): CodeSet => [cp, cp];

export function unionSets(...sets: readonly CodeSet[]): CodeSet {
  const ranges: [number, number][] = [];
  for (const set of sets)
    for (let i = 0; i < set.length; i += 2) ranges.push([set[i]!, set[i + 1]!]);
  return codeSet(ranges);
}

export function complementSet(set: CodeSet): CodeSet {
  const out: number[] = [];
  let next = 0;
  for (let i = 0; i < set.length; i += 2) {
    if (set[i]! > next) out.push(next, set[i]! - 1);
    next = set[i + 1]! + 1;
  }
  if (next <= MAX_CODE_POINT) out.push(next, MAX_CODE_POINT);
  return out;
}

const hex = (cp: number): string => `\\u{${cp.toString(16)}}`;

/** The set as a JavaScript class for a `u` pattern; the empty set is `[]`, which matches nothing. */
export function setSource(set: CodeSet): string {
  let out = '[';
  for (let i = 0; i < set.length; i += 2) {
    const lo = set[i]!;
    const hi = set[i + 1]!;
    out += lo === hi ? hex(lo) : `${hex(lo)}-${hex(hi)}`;
  }
  return `${out}]`;
}

const ranges = (...pairs: [number, number][]): CodeSet => codeSet(pairs);
const c = (ch: string): number => ch.codePointAt(0)!;

const DIGITS = ranges([c('0'), c('9')]);
const WORD = ranges([c('0'), c('9')], [c('A'), c('Z')], [c('a'), c('z')], [c('_'), c('_')]);
// RE2's \s: [\t\n\f\r ], no vertical tab.
const SPACE = ranges([9, 10], [12, 13], [32, 32]);

/** RE2's Perl classes, ASCII only, by their small letter; the capital (`\D`) is the complement, taken after any
 *  case folding, as RE2 takes it. */
export const PERL_CLASSES: Readonly<Record<string, CodeSet>> = { d: DIGITS, s: SPACE, w: WORD };

/** RE2's ASCII classes, `[[:name:]]`, by name. */
export const POSIX_CLASSES: Readonly<Record<string, CodeSet>> = {
  alnum: ranges([c('0'), c('9')], [c('A'), c('Z')], [c('a'), c('z')]),
  alpha: ranges([c('A'), c('Z')], [c('a'), c('z')]),
  ascii: ranges([0, 0x7f]),
  blank: ranges([9, 9], [32, 32]),
  cntrl: ranges([0, 0x1f], [0x7f, 0x7f]),
  digit: DIGITS,
  graph: ranges([c('!'), c('~')]),
  lower: ranges([c('a'), c('z')]),
  print: ranges([c(' '), c('~')]),
  punct: ranges([c('!'), c('/')], [c(':'), c('@')], [c('['), c('`')], [c('{'), c('~')]),
  space: ranges([9, 13], [32, 32]),
  upper: ranges([c('A'), c('Z')]),
  word: WORD,
  xdigit: ranges([c('0'), c('9')], [c('A'), c('F')], [c('a'), c('f')]),
};
