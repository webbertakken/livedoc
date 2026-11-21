// Text counted in bytes, as a double-byte character set counts it (docs/specs/029-sheets/formulas.md "Text"): LENB,
// LEFTB, RIGHTB, MIDB, REPLACEB, FINDB, SEARCHB; and ASC, full-width text as half-width.
import { scalarFn, type FnDef } from '../fn';
import { boundedText } from '../operators';
import { err, isError, toNumber, toText } from '../values';
import { textFn } from './text-args';
import { regex, wildcardSource } from './text-patterns';

// East Asian Wide and Fullwidth characters (Unicode UAX #11): CJK, kana, Hangul and the full-width forms; and
// half-width katakana, two bytes as Google counts it (D43).
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xff61, 0xff9f],
  [0xffe0, 0xffe6],
  [0x20000, 0x3fffd],
];

/** The bytes a character counts for: 2 when East Asian wide or full-width, else 1. */
export function byteWidth(ch: string): number {
  const cp = ch.codePointAt(0)!;
  return WIDE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1;
}

function bytesOf(chars: readonly string[], from = 0, to = chars.length): number {
  let n = 0;
  for (let i = from; i < to; i++) n += byteWidth(chars[i]!);
  return n;
}

// Where a window of `bytes` bytes from character `from` ends: every character starting inside it is in it whole, so
// a double-byte character the window's end cuts is kept (Google's MIDB example: 熊本=熊本 from 2 for 4 is 本=熊).
function windowEnd(chars: readonly string[], from: number, bytes: number): number {
  let used = 0;
  let i = from;
  while (i < chars.length && used < bytes) used += byteWidth(chars[i++]!);
  return i;
}

// The same window counted back from the end.
function windowStart(chars: readonly string[], bytes: number): number {
  let used = 0;
  let i = chars.length;
  while (i > 0 && used < bytes) used += byteWidth(chars[--i]!);
  return i;
}

const NEGATIVE = 'The number of bytes cannot be negative';

// A character position from 1 found in characters, as a position in bytes from 1.
function bytePosition(hay: string, unitIndex: number): number {
  return bytesOf([...hay.slice(0, unitIndex)]) + 1;
}

// Full-width ASCII and katakana, each to its half-width form; voiced kana to the kana and its sound mark (ガ to ｶﾞ).
const HALF_WIDTH: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (let cp = 0xff01; cp <= 0xff5e; cp++)
    map.set(String.fromCodePoint(cp), String.fromCodePoint(cp - 0xfee0));
  for (let cp = 0xff61; cp <= 0xff9f; cp++) {
    const half = String.fromCodePoint(cp);
    map.set(half.normalize('NFKC'), half);
  }
  for (let cp = 0xff66; cp <= 0xff9d; cp++) {
    for (const mark of ['\uff9e', '\uff9f']) {
      const half = String.fromCodePoint(cp) + mark;
      const full = half.normalize('NFKC');
      if ([...full].length === 1) map.set(full, half);
    }
  }
  return map;
})();

// The other way: half-width ASCII and katakana to full-width, a kana and its sound mark to the voiced kana.
const FULL_WIDTH: ReadonlyMap<string, string> = new Map(
  [...HALF_WIDTH].map(([full, half]) => [half, full]),
);

function fullWidth(text: string): string {
  const chars = [...text];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const pair = FULL_WIDTH.get(chars[i]! + (chars[i + 1] ?? ''));
    if (pair) {
      out += pair;
      i++;
    } else out += FULL_WIDTH.get(chars[i]!) ?? chars[i]!;
  }
  return out;
}

// The full-width space, half-width a plain space, as Google's ASC writes it.
const IDEOGRAPHIC_SPACE = '\u3000';

export const BYTE_TEXT_FUNCTIONS: Record<string, FnDef> = {
  LENB: textFn(1, 1, 1, ([t]) => bytesOf([...t!])),
  LEFTB: textFn(1, 2, 1, ([t], [n = 1]) => {
    if (n < 0) return err('#VALUE!', NEGATIVE);
    const chars = [...t!];
    return chars.slice(0, windowEnd(chars, 0, n)).join('');
  }),
  RIGHTB: textFn(1, 2, 1, ([t], [n = 1]) => {
    if (n < 0) return err('#VALUE!', NEGATIVE);
    const chars = [...t!];
    return chars.slice(windowStart(chars, n)).join('');
  }),
  // starting_at counts characters, extract_length_bytes bytes, as Google's MIDB and REPLACEB do.
  MIDB: textFn(3, 3, 1, ([t], [start, n]) => {
    if (start! < 1) return err('#NUM!', 'Positions are counted from 1');
    if (n! < 0) return err('#VALUE!', NEGATIVE);
    const chars = [...t!];
    const from = Math.trunc(start!) - 1;
    return chars.slice(from, windowEnd(chars, from, n!)).join('');
  }),
  REPLACEB: scalarFn(4, 4, ([t, start, n, by], f) => {
    const text = toText(t!, f.locale);
    const from1 = toNumber(start!, f.locale);
    const bytes = toNumber(n!, f.locale);
    const rep = toText(by!, f.locale);
    for (const x of [text, from1, bytes, rep]) if (isError(x)) return x;
    if ((from1 as number) < 1) return err('#VALUE!', 'Positions are counted from 1');
    if ((bytes as number) < 0) return err('#VALUE!', NEGATIVE);
    const chars = [...(text as string)];
    const from = Math.min(Math.trunc(from1 as number) - 1, chars.length);
    const end = windowEnd(chars, from, bytes as number);
    return boundedText([...chars.slice(0, from), rep as string, ...chars.slice(end)].join(''));
  }),
  FINDB: textFn(2, 3, 2, ([needle, hay], [start = 1]) => {
    const chars = [...hay!];
    if (start < 1 || start > chars.length + 1) return err('#VALUE!');
    const from = chars.slice(0, Math.trunc(start) - 1).join('').length;
    const i = hay!.indexOf(needle!, from);
    return i < 0 ? err('#VALUE!', `"${needle}" was not found`) : bytePosition(hay!, i);
  }),
  SEARCHB: textFn(2, 3, 2, ([needle, hay], [start = 1]) => {
    const chars = [...hay!];
    if (start < 1 || start > chars.length + 1) return err('#VALUE!');
    const from = chars.slice(0, Math.trunc(start) - 1).join('').length;
    const re = regex(wildcardSource(needle!), hay!, 'iu');
    if (!(re instanceof RegExp)) return re;
    const m = re.exec(hay!.slice(from));
    return m ? bytePosition(hay!, from + m.index) : err('#VALUE!', `"${needle}" was not found`);
  }),
  JIS: textFn(1, 1, 1, ([t]) => fullWidth(t!)),
  ASC: textFn(1, 1, 1, ([t]) =>
    [...t!.normalize('NFC')]
      .map((ch) => (ch === IDEOGRAPHIC_SPACE ? ' ' : (HALF_WIDTH.get(ch) ?? ch)))
      .join(''),
  ),
};
