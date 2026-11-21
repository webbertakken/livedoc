// Numbers written as text (docs/specs/029-sheets/formulas.md "Text"): DOLLAR and FIXED in the spreadsheet's locale,
// ROMAN and ARABIC as LibreOffice and Excel write Roman numerals.
import { localeCurrency } from '../../locale-currency';
import { localeSeparators } from '../../input';
import { boolArg, fn, intArg, numArg, opt, scalarFn, textArg, type FnDef } from '../fn';
import type { Frame } from '../../engine/frame';
import { err, isError, toText, type Scalar, type Value } from '../values';
import { roundHalfAway } from './math';

// Intl writes at most 100 decimals; past it the zeros are added by hand. Excel's limit on number_of_places is 127.
const INTL_DECIMALS_MAX = 100;
export const FIXED_DECIMALS_MAX = 127;

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let nf = formatters.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, opts);
    formatters.set(key, nf);
  }
  return nf;
}

// A number rounded to `places` (left of the point when negative), written with that many decimals.
function fixedText(x: number, places: number, f: Frame, opts: Intl.NumberFormatOptions): Value {
  if (places > FIXED_DECIMALS_MAX) return err('#VALUE!', 'At most 127 decimal places');
  const decimals = Math.max(0, places);
  const shown = Math.min(decimals, INTL_DECIMALS_MAX);
  const text = formatter(f.locale, {
    ...opts,
    minimumFractionDigits: shown,
    maximumFractionDigits: shown,
  }).format(roundHalfAway(x, places) || 0); // -0 is written as 0
  return text + '0'.repeat(decimals - shown);
}

// Roman numerals by LibreOffice's ScRoman: a digit of 4 or 9 is written by subtraction, and each step of relaxation
// lets a larger numeral stand before a smaller one (ROMAN(499, 4) is ID).
const ROMAN_CHARS = ['M', 'D', 'C', 'L', 'X', 'V', 'I'];
const ROMAN_VALUES = [1000, 500, 100, 50, 10, 5, 1];
const ROMAN_MAX = 3999;
const ROMAN_MODES = 4;

export function romanNumeral(value: number, mode: number): string {
  let out = '';
  let rest = value;
  const last = ROMAN_VALUES.length - 1;
  for (let i = 0; i <= last / 2; i++) {
    let index = 2 * i;
    const digit = Math.floor(rest / ROMAN_VALUES[index]!);
    if (digit % 5 === 4) {
      const index2 = digit === 4 ? index - 1 : index - 2;
      let steps = 0;
      while (steps < mode && index < last) {
        steps++;
        if (ROMAN_VALUES[index2]! - ROMAN_VALUES[index + 1]! <= rest) index++;
        else steps = mode;
      }
      out += ROMAN_CHARS[index]! + ROMAN_CHARS[index2]!;
      rest = rest + ROMAN_VALUES[index]! - ROMAN_VALUES[index2]!;
    } else {
      if (digit > 4) out += ROMAN_CHARS[index - 1]!;
      out += ROMAN_CHARS[index]!.repeat(digit % 5);
      rest %= ROMAN_VALUES[index]!;
    }
  }
  return out;
}

// A Roman numeral read by LibreOffice's ScArabic: any case, empty is 0, and a numeral no relaxation of ROMAN writes
// (MMMM, IIIII, VX) is none.
const NUMERALS: Readonly<Record<string, { value: number; decimal: boolean }>> = {
  M: { value: 1000, decimal: true },
  D: { value: 500, decimal: false },
  C: { value: 100, decimal: true },
  L: { value: 50, decimal: false },
  X: { value: 10, decimal: true },
  V: { value: 5, decimal: false },
  I: { value: 1, decimal: true },
};

export function arabicValue(roman: string): number | null {
  const text = roman.toUpperCase();
  let value = 0;
  let validRest = ROMAN_MAX;
  let i = 0;
  while (i < text.length) {
    const first = NUMERALS[text[i]!];
    if (!first) return null;
    let second = 0;
    if (i + 1 < text.length) {
      const next = NUMERALS[text[i + 1]!];
      if (!next) return null;
      second = next.value;
    }
    if (first.value >= second) {
      value += first.value;
      validRest %= first.value * (first.decimal ? 5 : 2);
      if (validRest < first.value) return null;
      validRest -= first.value;
      i++;
    } else if (first.value * 2 !== second) {
      const diff = second - first.value;
      value += diff;
      if (validRest < diff) return null;
      validRest = first.value - 1;
      i += 2;
    } else return null;
  }
  return value;
}

// NUMBERVALUE: text read with the given decimal separator (one character) and group separators, the locale's
// when left out. Group separators count only before the decimal one; spaces and line breaks are dropped; each
// trailing % divides by 100. Empty text, or what is left reading as no number, is #VALUE!.
const PLAIN_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

function numberValue(xs: Scalar[], f: Frame): Value {
  const texts: string[] = [];
  for (const x of xs) {
    const t = toText(x, f.locale);
    if (isError(t)) return t;
    texts.push(t);
  }
  const [text, decimalGiven, groupGiven] = texts as [string, string?, string?];
  const locale = localeSeparators(f.locale);
  const decimal = decimalGiven ?? locale.decimal;
  const groups = groupGiven ?? (decimalGiven === undefined ? locale.group : '');
  if ([...decimal].length !== 1)
    return err('#VALUE!', 'The decimal separator must be one character');
  if (groups.includes(decimal))
    return err('#VALUE!', 'The decimal separator cannot be a group separator');
  // A number is already one, whatever the separators.
  if (typeof xs[0] === 'number') return xs[0];
  const at = text.indexOf(decimal);
  let whole = at < 0 ? text : text.slice(0, at);
  for (const g of groups) whole = whole.split(g).join('');
  let s = (whole + (at < 0 ? '' : '.' + text.slice(at + 1))).replace(/[ \t\n\r]/g, '');
  let percents = 0;
  while (s.endsWith('%')) {
    s = s.slice(0, -1);
    percents++;
  }
  if (!PLAIN_NUMBER.test(s)) return err('#VALUE!', `"${text}" is not a number`);
  return Number(s) / 100 ** percents;
}

export const NUMBER_TEXT_FUNCTIONS: Record<string, FnDef> = {
  NUMBERVALUE: scalarFn(1, 3, numberValue),
  DOLLAR: fn(1, 2, (args, f) => {
    const x = numArg(args[0]!, f);
    const places = opt(args, 1, f, intArg, 2);
    if (isError(x)) return x;
    if (isError(places)) return places;
    return fixedText(x, places, f, { style: 'currency', currency: localeCurrency(f.locale) });
  }),
  FIXED: fn(1, 3, (args, f) => {
    const x = numArg(args[0]!, f);
    const places = opt(args, 1, f, intArg, 2);
    const plain = opt(args, 2, f, boolArg, false);
    if (isError(x)) return x;
    if (isError(places)) return places;
    if (isError(plain)) return plain;
    return fixedText(x, places, f, { useGrouping: !plain });
  }),
  ROMAN: fn(1, 2, (args, f) => {
    const x = intArg(args[0]!, f);
    const mode = opt(args, 1, f, intArg, 0);
    if (isError(x)) return x;
    if (isError(mode)) return mode;
    if (x < 0 || x > ROMAN_MAX) return err('#VALUE!', 'ROMAN writes 0 to 3999');
    if (mode < 0 || mode > ROMAN_MODES) return err('#VALUE!', 'The relaxation is 0 to 4');
    return romanNumeral(x, mode);
  }),
  ARABIC: fn(1, 1, (args, f) => {
    const t = textArg(args[0]!, f);
    if (isError(t)) return t;
    const value = arabicValue(t);
    return value ?? err('#VALUE!', `"${t}" is not a Roman numeral`);
  }),
};
