// Text functions (docs/specs/029-sheets/formulas.md "Functions": Text). Results are bounded by TEXT_RESULT_MAX;
// REGEX functions by a work estimate, since a regular expression cannot be interrupted.
import { TEXT_RESULT_MAX } from '../../limits';
import { textFormat } from '../../number-format';
import { parseLocaleNumber } from '../../input';
import { localeDayFirst, parseDateText, parseTimeText } from '../../dates';
import {
  MANY,
  arrayArg,
  boolArg,
  flatScalars,
  flatValues,
  fn,
  lift,
  opt,
  scalarFn,
  textArg,
  valueArg,
  type FnDef,
} from '../fn';
import { err, isError, toNumber, toText, type Scalar, type Value } from '../values';
import { boundedText } from '../operators';
import { textEach, textFn, texts } from './text-args';
import { BYTE_TEXT_FUNCTIONS } from './text-bytes';
import { NUMBER_TEXT_FUNCTIONS } from './text-numbers';
import { regex, wildcardSource } from './text-patterns';

// A REGEX function: its text must be text, not a number, as Google's are (formulas.md "Text").
function regexFn(n: number, each: (ts: string[]) => Value): FnDef {
  return fn(n, n, (args, f) =>
    lift(
      args.map((a) => valueArg(a, f)),
      (xs) =>
        typeof xs[0] === 'number'
          ? err('#VALUE!', 'A regular expression reads text, not a number')
          : textEach(xs, [], n, n, (ts) => each(ts)),
    ),
  );
}

/** Every value of every argument, ranges read whole, joined in order: CONCATENATE, and CONCAT as the standards have it. */
export const JOIN_VALUES: FnDef = fn(1, MANY, (args, f) => {
  const ts = texts(flatScalars(args, f));
  return Array.isArray(ts) ? boundedText(ts.join('')) : ts;
});

export const TEXT_FUNCTIONS: Record<string, FnDef> = {
  CONCATENATE: JOIN_VALUES,
  TEXTJOIN: fn(3, MANY, (args, f) => {
    const delim = textArg(args[0]!, f);
    if (isError(delim)) return delim;
    const skip = boolArg(args[1]!, f);
    if (isError(skip)) return skip;
    const ts = texts(flatScalars(args.slice(2), f));
    if (!Array.isArray(ts)) return ts;
    return boundedText((skip ? ts.filter((t) => t !== '') : ts).join(delim));
  }),
  // Each value_or_array one row or one column, as Google's are.
  JOIN: fn(2, MANY, (args, f) => {
    const delim = args[0] === null ? '' : textArg(args[0]!, f);
    if (isError(delim)) return delim;
    const values: Scalar[] = [];
    for (const a of args.slice(1)) {
      const arr = arrayArg(a, f);
      if (arr.rows.length > 1 && arr.rows[0]!.length > 1)
        return err('#VALUE!', 'JOIN takes one row or one column at a time');
      values.push(...flatValues(arr));
    }
    const ts = texts(values);
    return Array.isArray(ts) ? boundedText(ts.join(delim)) : ts;
  }),
  LEFT: textFn(1, 2, 1, ([t], [n = 1]) => (n < 0 ? err('#VALUE!') : [...t!].slice(0, n).join(''))),
  RIGHT: textFn(1, 2, 1, ([t], [n = 1]) => {
    if (n < 0) return err('#VALUE!');
    const chars = [...t!];
    const k = Math.trunc(n);
    return k === 0 ? '' : chars.slice(-k).join('');
  }),
  MID: textFn(3, 3, 1, ([t], [start, n]) => {
    if (start! < 1 || n! < 0) return err('#VALUE!');
    return [...t!].slice(start! - 1, start! - 1 + n!).join('');
  }),
  LEN: textFn(1, 1, 1, ([t]) => [...t!].length),
  UPPER: textFn(1, 1, 1, ([t]) => t!.toUpperCase()),
  LOWER: textFn(1, 1, 1, ([t]) => t!.toLowerCase()),
  PROPER: textFn(1, 1, 1, ([t]) =>
    t!
      .toLowerCase()
      .replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase()),
  ),
  TRIM: textFn(1, 1, 1, ([t]) => t!.replace(/ +/g, ' ').trim()),
  CLEAN: textFn(1, 1, 1, ([t]) => [...t!].filter((ch) => ch.charCodeAt(0) >= 32).join('')),
  SUBSTITUTE: textFn(3, 4, 3, ([t, from, to], [nth]) => {
    if (from === '') return t!;
    if (nth === undefined) return t!.split(from!).join(to);
    if (nth < 1) return err('#VALUE!');
    let at = -1;
    for (let k = 0; k < nth; k++) {
      at = t!.indexOf(from!, at + 1);
      if (at < 0) return t!;
    }
    return t!.slice(0, at) + to! + t!.slice(at + from!.length);
  }),
  REPLACE: scalarFn(4, 4, ([t, start, n, by]) => {
    const text = toText(t!);
    const s = toNumber(start!);
    const len = toNumber(n!);
    const rep = toText(by!);
    for (const x of [text, s, len, rep]) if (isError(x)) return x;
    if ((s as number) < 1 || (len as number) < 0) return err('#VALUE!');
    const chars = [...(text as string)];
    chars.splice((s as number) - 1, len as number, rep as string);
    return boundedText(chars.join(''));
  }),
  FIND: textFn(2, 3, 2, ([needle, hay], [start = 1]) => {
    const i = hay!.indexOf(needle!, start - 1);
    return start < 1 || i < 0 ? err('#VALUE!', `"${needle}" was not found`) : i + 1;
  }),
  SEARCH: textFn(2, 3, 2, ([needle, hay], [start = 1]) => {
    if (start < 1 || start > hay!.length + 1) return err('#VALUE!');
    const re = regex(wildcardSource(needle!), hay!, 'iu');
    if (!(re instanceof RegExp)) return re;
    const m = re.exec(hay!.slice(start - 1));
    return m ? m.index + start : err('#VALUE!', `"${needle}" was not found`);
  }),
  REPT: textFn(2, 2, 1, ([t], [n]) => {
    if (n! < 0) return err('#VALUE!');
    if (t!.length * n! > TEXT_RESULT_MAX)
      return err('#VALUE!', 'The text is longer than a cell holds');
    return t!.repeat(Math.floor(n!));
  }),
  EXACT: textFn(2, 2, 2, ([a, b]) => a === b),
  TEXT: scalarFn(2, 2, ([v, code]) => {
    const c = toText(code!);
    if (isError(c)) return c;
    if (typeof v === 'number') return boundedText(textFormat(v, c));
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (isError(v!)) return v;
    return boundedText(textFormat(v ?? '', c));
  }),
  VALUE: scalarFn(1, 1, ([v], f) => {
    if (typeof v === 'number') return v;
    if (v === null) return 0;
    if (typeof v !== 'string') return isError(v!) ? v : err('#VALUE!');
    const t = v.trim();
    const pct = t.endsWith('%') ? parseLocaleNumber(t.slice(0, -1).trim(), f.locale) : null;
    if (pct !== null) return pct / 100;
    const n = parseLocaleNumber(t.replace(/^[£$€¥₹]/, ''), f.locale);
    if (n !== null) return n;
    const time = parseTimeText(t);
    if (time !== null) return time;
    const date = parseDateText(t, localeDayFirst(f.locale));
    return date ? date.serial : err('#VALUE!', `"${t}" is not a number`);
  }),
  CHAR: textFn(1, 1, 0, (_t, [n]) => {
    const code = Math.trunc(n!);
    return code < 1 || code > 0x10ffff ? err('#VALUE!') : String.fromCodePoint(code);
  }),
  CODE: textFn(1, 1, 1, ([t]) => (t === '' ? err('#VALUE!') : t!.codePointAt(0)!)),
  UNICODE: textFn(1, 1, 1, ([t]) => (t === '' ? err('#VALUE!') : t!.codePointAt(0)!)),
  // A code point that is a character: none for a surrogate half or one Unicode leaves unassigned.
  UNICHAR: textFn(1, 1, 0, (_t, [n]) => {
    const code = Math.trunc(n!);
    if (code < 1 || code > 0x10ffff)
      return err('#VALUE!', 'There is no character with this number');
    const ch = String.fromCodePoint(code);
    return /^[\p{Cs}\p{Cn}]$/u.test(ch)
      ? err('#VALUE!', 'There is no character with this number')
      : ch;
  }),
  // Text as itself; any other value as empty text, an error as itself.
  T: scalarFn(1, 1, ([v]) => (typeof v === 'string' || isError(v!) ? v : '')),
  SPLIT: fn(2, 4, (args, f) => {
    const text = textArg(args[0]!, f);
    const delim = textArg(args[1]!, f);
    const each = opt(args, 2, f, boolArg, true);
    const dropEmpty = opt(args, 3, f, boolArg, true);
    for (const x of [text, delim, each, dropEmpty]) if (isError(x)) return x;
    if (delim === '') return text;
    let parts: string[];
    if (each) {
      const set = new Set([...(delim as string)]);
      parts = [];
      let cur = '';
      for (const ch of text as string) {
        if (set.has(ch)) {
          parts.push(cur);
          cur = '';
        } else cur += ch;
      }
      parts.push(cur);
    } else {
      parts = (text as string).split(delim as string);
    }
    if (dropEmpty) parts = parts.filter((p) => p !== '');
    if (parts.length === 0) return '';
    // A part that reads as a number is one, as in Google Sheets: SPLIT("3,4", ",") sums to 7, not 0.
    return { rows: [parts.map(splitPart)] };
  }),
  REGEXMATCH: regexFn(2, ([t, p]) => {
    const re = regex(p!, t!);
    return re instanceof RegExp ? re.test(t!) : re;
  }),
  // The whole match, or its capture groups, one column each.
  REGEXEXTRACT: regexFn(2, ([t, p]) => {
    const re = regex(p!, t!);
    if (!(re instanceof RegExp)) return re;
    const m = re.exec(t!);
    if (!m) return err('#N/A', 'The pattern did not match');
    if (m.length === 1) return m[0];
    if (m.length === 2) return m[1] ?? '';
    return { rows: [m.slice(1).map((g) => g ?? '')] };
  }),
  REGEXREPLACE: regexFn(3, ([t, p, by]) => {
    const re = regex(p!, t!, 'gu');
    return re instanceof RegExp ? t!.replace(re, by!) : re;
  }),
  // The value is the label; where it goes is Workbook.hyperlinkOf's, read from the formula (safeHyperlink).
  HYPERLINK: textFn(1, 2, 2, ([url, label]) =>
    label === undefined || label === '' ? url! : label,
  ),
  ...BYTE_TEXT_FUNCTIONS,
  ...NUMBER_TEXT_FUNCTIONS,
};

// A part written as an ISO date, YYYY-MM-DD, with or without a time after it. Only this form: `26/10/2026` or
// `Oct 26` reads differently by locale, so it stays text (formulas.md "Text").
const ISO_DATE_PART = /^\d{4}-\d{2}-\d{2}(?:[ T]|$)/;

// One part of a SPLIT: a number (or a percentage) when it reads as one, a date when written as an ISO date, else the
// text. A blank part stays text.
function splitPart(part: string): Scalar {
  if (part.trim() === '') return part;
  if (ISO_DATE_PART.test(part.trim())) {
    const date = parseDateText(part, false);
    if (date) return date.serial;
  }
  const n = toNumber(part);
  return typeof n === 'number' ? n : part;
}
