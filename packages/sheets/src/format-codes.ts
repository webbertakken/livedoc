// Spreadsheet format codes for TEXT(value, code) (docs/specs/029-sheets/formulas.md "Functions"): "0.00",
// "#,##0", "0%", "0.00E+00", "dd/mm/yyyy", "mmm yyyy", "hh:mm", "[h]:mm", "£#,##0.00", "@", sections split by ";".
// English names, locale-independent, as TEXT is in Sheets.
import { DAY_NAMES, MONTH_NAMES, dateFromSerial } from './dates';
import { numberText } from './formula/values';
import { FORMAT_CODE_MAX } from './limits';

type Tok =
  | { k: 'lit'; v: string }
  | { k: 'ph'; v: '0' | '#' | '?' }
  | { k: 'dot' }
  | { k: 'comma' }
  | { k: 'pct' }
  | { k: 'exp'; sign: '+' | '-'; digits: number }
  | { k: 'at' }
  | { k: 'date'; v: string };

export function splitSections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    if (ch === '"') quoted = !quoted;
    if (ch === '\\' && !quoted && i + 1 < code.length) {
      cur += ch + code[++i];
      continue;
    }
    if (ch === ';' && !quoted) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const DATE_RE =
  /^(\[h+\]|\[m+\]|\[s+\]|yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|am\/pm|a\/p|\.0+)/i;

function tokenize(section: string, dateMode: boolean): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < section.length) {
    const ch = section[i]!;
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      const stop = end < 0 ? section.length : end;
      out.push({ k: 'lit', v: section.slice(i + 1, stop) });
      i = stop + 1;
      continue;
    }
    if (ch === '\\' && i + 1 < section.length) {
      out.push({ k: 'lit', v: section[i + 1]! });
      i += 2;
      continue;
    }
    if (ch === '_' && i + 1 < section.length) {
      out.push({ k: 'lit', v: ' ' });
      i += 2;
      continue;
    }
    if (ch === '*' && i + 1 < section.length) {
      i += 2;
      continue;
    }
    if (ch === '[' && !/^\[[hms]+\]/i.test(section.slice(i))) {
      // A currency (`[$€-407]`) draws its symbol; a colour or condition ([Red], [>100]) is read past.
      const end = section.indexOf(']', i);
      const stop = end < 0 ? section.length : end;
      const currency = /^\$([^-]*)/.exec(section.slice(i + 1, stop));
      if (currency?.[1]) out.push({ k: 'lit', v: currency[1] });
      i = stop + 1;
      continue;
    }
    if (dateMode) {
      const m = DATE_RE.exec(section.slice(i));
      if (m) {
        out.push({ k: 'date', v: m[1]! });
        i += m[1]!.length;
        continue;
      }
    } else {
      if (ch === '0' || ch === '#' || ch === '?') {
        out.push({ k: 'ph', v: ch });
        i++;
        continue;
      }
      if (ch === '.') {
        out.push({ k: 'dot' });
        i++;
        continue;
      }
      if (ch === ',') {
        out.push({ k: 'comma' });
        i++;
        continue;
      }
      if (ch === '%') {
        out.push({ k: 'pct' });
        i++;
        continue;
      }
      const e = /^[eE]([+-])(0+)/.exec(section.slice(i));
      if (e) {
        out.push({ k: 'exp', sign: e[1] as '+' | '-', digits: e[2]!.length });
        i += e[0].length;
        continue;
      }
    }
    if (ch === '@') {
      out.push({ k: 'at' });
      i++;
      continue;
    }
    out.push({ k: 'lit', v: ch });
    i++;
  }
  return out;
}

// A section's own characters: its quoted text and escapes out, and every bracket but elapsed time's (`[h]`). One
// pass, so a run of `[` or `"` costs no more than its length.
function bareSection(section: string): string {
  let out = '';
  const lastClose = section.lastIndexOf(']');
  for (let i = 0; i < section.length; i++) {
    const ch = section[i]!;
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '"') {
      const end = section.indexOf('"', i + 1);
      if (end < 0) return out + section.slice(i);
      i = end;
      continue;
    }
    if (ch === '[' && i < lastClose) {
      const end = section.indexOf(']', i);
      const inner = section.slice(i + 1, end);
      if (/[hms]/i.test(inner)) out += `[${inner}]`;
      i = end;
      continue;
    }
    out += ch;
  }
  return out;
}

export function isDateSection(section: string): boolean {
  const bare = bareSection(section);
  return /[dmyhs]|am\/pm|a\/p/i.test(bare) && !/[0#?]/.test(bare.replace(/\.0+/g, ''));
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatNumberSection(n: number, toks: Tok[]): string {
  let value = n;
  const pctCount = toks.filter((t) => t.k === 'pct').length;
  value *= 100 ** pctCount;
  const firstPh = toks.findIndex((t) => t.k === 'ph');
  const dotAt = toks.findIndex((t) => t.k === 'dot');
  const expTok = toks.find((t) => t.k === 'exp');
  const expAt = toks.findIndex((t) => t.k === 'exp');
  const intEnd = dotAt >= 0 ? dotAt : expAt >= 0 ? expAt : toks.length;
  const intPh = toks.slice(0, intEnd).filter((t) => t.k === 'ph');
  const fracToks = dotAt >= 0 ? toks.slice(dotAt + 1, expAt >= 0 ? expAt : undefined) : [];
  const fracPh = fracToks.filter((t) => t.k === 'ph');
  // Commas between integer placeholders group thousands; trailing commas after them scale by 1000.
  const intToks = toks.slice(firstPh < 0 ? 0 : firstPh, intEnd);
  const lastPhInInt = intToks.map((t) => t.k).lastIndexOf('ph');
  const grouping = intToks.some((t, i) => t.k === 'comma' && i < lastPhInInt);
  // Commas straight after the last placeholder (before or after the decimals) scale by 1000 each.
  const lastPh = toks.map((t) => t.k).lastIndexOf('ph');
  let trailingCommas = 0;
  for (let i = lastPh + 1; i < toks.length && toks[i]!.k === 'comma'; i++) trailingCommas++;
  value /= 1000 ** trailingCommas;

  let body: string;
  if (firstPh < 0) {
    body = '';
  } else if (expTok) {
    const fracDigits = fracPh.length;
    let exp = value === 0 ? 0 : Math.floor(Math.log10(Math.abs(value)));
    let mant = value / 10 ** exp;
    if (Number(Math.abs(mant).toFixed(fracDigits)) >= 10) {
      mant /= 10;
      exp += 1;
    }
    const m = Math.abs(mant).toFixed(fracDigits);
    const expText = String(Math.abs(exp)).padStart(expTok.digits, '0');
    body = `${m}E${exp < 0 ? '-' : expTok.sign === '+' ? '+' : ''}${expText}`;
  } else {
    const fracMax = fracPh.length;
    const fracMin = (() => {
      let k = fracPh.length;
      while (k > 0 && fracPh[k - 1]!.v === '#') k--;
      return k;
    })();
    const fixed = decimalFixed(Math.abs(value), fracMax);
    let [intPart, frac = ''] = fixed.split('.');
    while (frac.length > fracMin && frac.endsWith('0')) frac = frac.slice(0, -1);
    const minInt = intPh.filter((t) => t.k === 'ph' && t.v === '0').length;
    if (intPart === '0' && minInt === 0) intPart = '';
    intPart = intPart!.padStart(minInt, '0');
    if (grouping) intPart = group(intPart);
    body = dotAt >= 0 && (frac.length > 0 || fracPh.length > 0) ? `${intPart}.${frac}` : intPart;
    if (dotAt >= 0 && frac.length === 0 && fracMin === 0) body = `${intPart}.`;
  }
  // Literals before the first placeholder lead; the rest follow.
  let prefix = '';
  let suffix = '';
  toks.forEach((t, i) => {
    const text = t.k === 'lit' ? t.v : t.k === 'pct' ? '%' : '';
    if (!text) return;
    if (firstPh < 0 || i < firstPh) prefix += text;
    else suffix += text;
  });
  return `${prefix}${body}${suffix}`;
}

function formatDateSection(serial: number, toks: Tok[]): string {
  const p = dateFromSerial(serial);
  const hasAmPm = toks.some((t) => t.k === 'date' && /^(am\/pm|a\/p)$/i.test(t.v));
  let out = '';
  toks.forEach((t, i) => {
    if (t.k === 'lit') {
      out += t.v;
      return;
    }
    if (t.k !== 'date') return;
    const v = t.v.toLowerCase();
    // "m" after an hour or before a second is minutes.
    const prev = toks
      .slice(0, i)
      .reverse()
      .find((x) => x.k === 'date');
    const next = toks.slice(i + 1).find((x) => x.k === 'date');
    const minuteCtx =
      (prev?.k === 'date' && /^(h+|\[h+\])$/i.test(prev.v)) ||
      (next?.k === 'date' && /^s+$/i.test(next.v));
    const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
    const hour = hasAmPm ? h12 : p.h;
    switch (true) {
      case v === 'yyyy':
        out += String(p.y).padStart(4, '0');
        break;
      case v === 'yy':
        out += String(p.y % 100).padStart(2, '0');
        break;
      case v === 'mmmmm':
        out += MONTH_NAMES[p.m - 1]![0];
        break;
      case v === 'mmmm':
        out += MONTH_NAMES[p.m - 1];
        break;
      case v === 'mmm':
        out += MONTH_NAMES[p.m - 1]!.slice(0, 3);
        break;
      case v === 'mm':
        out += String(minuteCtx ? p.min : p.m).padStart(2, '0');
        break;
      case v === 'm':
        out += String(minuteCtx ? p.min : p.m);
        break;
      case v === 'dddd':
        out += DAY_NAMES[p.weekday];
        break;
      case v === 'ddd':
        out += DAY_NAMES[p.weekday]!.slice(0, 3);
        break;
      case v === 'dd':
        out += String(p.d).padStart(2, '0');
        break;
      case v === 'd':
        out += String(p.d);
        break;
      case v === 'hh':
        out += String(hour).padStart(2, '0');
        break;
      case v === 'h':
        out += String(hour);
        break;
      case v === 'ss':
        out += String(p.s).padStart(2, '0');
        break;
      case v === 's':
        out += String(p.s);
        break;
      case v === 'am/pm':
        out += p.h < 12 ? 'AM' : 'PM';
        break;
      case v === 'a/p':
        out += p.h < 12 ? 'A' : 'P';
        break;
      case /^\[h+\]$/.test(v):
        out += String(Math.floor(serial * 24)).padStart(v.length - 2, '0');
        break;
      case /^\[m+\]$/.test(v):
        out += String(Math.floor(serial * 1440)).padStart(v.length - 2, '0');
        break;
      case /^\[s+\]$/.test(v):
        out += String(Math.round(serial * 86_400)).padStart(v.length - 2, '0');
        break;
      case v.startsWith('.'): {
        const digits = v.length - 1;
        const frac = (serial * 86_400) % 1;
        out += `.${Math.floor(frac * 10 ** digits)
          .toString()
          .padStart(digits, '0')}`;
        break;
      }
    }
  });
  return out;
}

// A non-negative number to `digits` decimals, rounding half away as ROUND does: worked at 15 significant digits
// first, so 1.005 (stored as 1.00499…) draws 1.01 as the Number format and ROUND give it, not 1.00.
function decimalFixed(x: number, digits: number): string {
  const scaled = x * 10 ** digits;
  if (!(scaled < 1e15)) return x.toFixed(digits);
  return (Math.round(Number(scaled.toPrecision(15))) / 10 ** digits).toFixed(digits);
}

/** What a code draws: its text, and the colour its section names (formatting.md "Number formats", D192). */
export type CodeDraw = { text: string; colour?: string };

/** A code's colours by their name in any case (`[Red]`), as the grid draws them. */
export const CODE_COLOURS: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#00FF00',
  blue: '#0000FF',
  yellow: '#FFFF00',
  magenta: '#FF00FF',
  cyan: '#00FFFF',
};

type Condition = { op: '<' | '<=' | '>' | '>=' | '=' | '<>'; n: number };
const CONDITION = /^(<=|>=|<>|<|>|=)\s*(-?\d+(?:\.\d+)?)$/;
const ELAPSED = /^[hms]+$/i;
// An Excel palette colour (`[Color10]`): read past, as no grid colour is named for it.
const PALETTE = /^color\d{1,2}$/i;

// The brackets of a section outside its quotes and escapes, each without its `[` and `]`.
function bracketsOf(section: string): string[] {
  const out: string[] = [];
  let quoted = false;
  for (let i = 0; i < section.length; i++) {
    const ch = section[i]!;
    if (ch === '\\' && !quoted) i++;
    else if (ch === '"') quoted = !quoted;
    else if (ch === '[' && !quoted) {
      const end = section.indexOf(']', i);
      if (end < 0) break;
      out.push(section.slice(i + 1, end));
      i = end;
    }
  }
  return out;
}

// A section with its brackets (`[Red]`, `[<0]`) taken out, in one pass however many `[` it holds.
function withoutBrackets(section: string): string {
  let out = '';
  let open = false;
  for (const ch of section) {
    if (open) open = ch !== ']';
    else if (ch === '[') open = true;
    else out += ch;
  }
  return out;
}

// A section's colour and condition, read from its brackets.
function metaOf(section: string): { colour?: string; condition?: Condition } {
  const meta: { colour?: string; condition?: Condition } = {};
  for (const inner of bracketsOf(section)) {
    const colour = CODE_COLOURS[inner.toLowerCase()];
    if (colour) meta.colour = colour;
    const m = CONDITION.exec(inner.trim());
    if (m) meta.condition = { op: m[1] as Condition['op'], n: Number(m[2]) };
  }
  return meta;
}

function holds({ op, n }: Condition, v: number): boolean {
  switch (op) {
    case '<':
      return v < n;
    case '<=':
      return v <= n;
    case '>':
      return v > n;
    case '>=':
      return v >= n;
    case '=':
      return v === n;
    case '<>':
      return v !== n;
  }
}

// The section a number takes: by its sign, or by the first condition that holds (D191); signed, the number keeps
// its minus. None, when no section takes it.
function sectionFor(sections: string[], v: number): { section: string; signed: boolean } | null {
  const numeric = sections.slice(0, 3);
  if (!numeric.some((section) => metaOf(section).condition)) {
    if (v < 0 && sections.length >= 2) return { section: sections[1]!, signed: false };
    if (v === 0 && sections.length >= 3) return { section: sections[2]!, signed: false };
    // One section for every number: a negative keeps its minus.
    return { section: sections[0]!, signed: true };
  }
  // The minus goes with the digits: a section of words alone ("far") draws none.
  for (const section of numeric) {
    const { condition } = metaOf(section);
    if (!condition || holds(condition, v))
      return { section, signed: tokenize(section, false).some((t) => t.k === 'ph') };
  }
  return null;
}

function withColour(text: string, section: string): CodeDraw {
  const { colour } = metaOf(section);
  return colour ? { text, colour } : { text };
}

export function formatCodeDraw(value: number | string, code: string): CodeDraw {
  const sections = splitSections(code);
  if (typeof value === 'string') {
    const textSection = sections[3] ?? sections.find((s) => s.includes('@'));
    if (!textSection) return { text: value };
    const text = tokenize(textSection, false)
      .map((t) => (t.k === 'at' ? value : t.k === 'lit' ? t.v : ''))
      .join('');
    return withColour(text, textSection);
  }
  if (code.trim() === '') return { text: numberText(value) };
  const picked = sectionFor(sections, value);
  if (!picked) return { text: numberText(value) };
  const { section, signed } = picked;
  // An empty section among several hides its numbers, as in Excel and Google Sheets (`;;;` hides everything).
  if (section === '' && sections.length >= 2) return { text: '' };
  const n = Math.abs(value);
  const minus = signed && value < 0 ? '-' : '';
  if (withoutBrackets(section).trim().toLowerCase() === 'general')
    return withColour(minus + numberText(n), section);
  if (isDateSection(section))
    return withColour(formatDateSection(signed ? value : n, tokenize(section, true)), section);
  return withColour(minus + formatNumberSection(n, tokenize(section, false)), section);
}

/** A code's text, as TEXT draws it: the section's, never its colour (D192). */
export function formatCodeText(value: number | string, code: string): string {
  return formatCodeDraw(value, code).text;
}

// A bracket a code may hold: elapsed time (`[h]`), a currency (`[$€-407]`), a colour or a condition.
const knownBracket = (inner: string) =>
  ELAPSED.test(inner) ||
  PALETTE.test(inner) ||
  inner.startsWith('$') ||
  CODE_COLOURS[inner.toLowerCase()] !== undefined ||
  CONDITION.test(inner.trim());

/** Why a Custom number format's code cannot be read (formatting.md "Number formats"), or null when it can. */
export function formatCodeProblem(code: string): string | null {
  if (code.trim().length === 0) return 'Enter a format';
  if (code.length > FORMAT_CODE_MAX) return `Longer than ${FORMAT_CODE_MAX} characters`;
  let quoted = false;
  let open = -1;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    if (ch === '\\' && !quoted) {
      i++;
      continue;
    }
    if (ch === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (ch === '[') {
      if (open >= 0) return '`[` is not closed';
      open = i;
    } else if (ch === ']') {
      if (open < 0) return '`]` has no `[`';
      const inner = code.slice(open + 1, i);
      if (!knownBracket(inner)) return `\`[${inner}]\` is not a colour or a condition`;
      open = -1;
    }
  }
  if (open >= 0) return '`[` is not closed';
  if (quoted) return '`"` is not closed';
  if (splitSections(code).length > 4) return 'More than four sections';
  return null;
}

// Whether a Custom number format's code reads (sheet.md "Formatting"): no problem with it.
export function formatCodeReads(code: string): boolean {
  return formatCodeProblem(code) === null;
}
