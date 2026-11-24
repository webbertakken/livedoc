// A cell's number format as a format code, both ways (docs/specs/029-sheets/standard-mapping.md "Number formats in the
// file", D90, D91): each format of the model as the code Google Sheets writes for it, the date in the workbook's locale
// as the grid draws it; a code read back as that format when it is exactly one of theirs, any other as Custom.
import { validFormatValue } from '../format';
import { formatCodeReads } from '../format-codes';
import type { CellFormat, NumberFormatKind } from '../sheet';

/** The number part of a cell's format: what a format code holds. */
export type NumberFormat = Pick<CellFormat, 'nf' | 'dp' | 'cur' | 'nc'>;

/** A code read: the format it is (none for General, Automatic), or unread when no code `TEXT` takes. */
export type CodeRead = { ok: true; format: NumberFormat | undefined } | { ok: false };

const GENERAL = 'General';
const DEFAULT_SYMBOL = '£';

// The digits after the point a format's code shows: `.00` for 2, nothing for 0.
const decimalsCode = (dp: number) => (dp > 0 ? `.${'0'.repeat(dp)}` : '');

// A literal in a code: quoted, or each character escaped when it holds a quote.
const literal = (text: string) =>
  text.includes('"') ? [...text].map((ch) => `\\${ch}`).join('') : `"${text}"`;

const SHORT_DATE_PARTS: Readonly<Record<string, string>> = { day: 'dd', month: 'mm', year: 'yyyy' };
const SHORT_DATES = new Map<string, string>();

/** The locale's short date as a code, as the grid draws Date (`dd/mm/yyyy` in en-GB, `mm/dd/yyyy` in en-US). */
export function shortDateCode(locale: string): string {
  const known = SHORT_DATES.get(locale);
  if (known !== undefined) return known;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    format = new Intl.DateTimeFormat('en', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  const code = format
    .formatToParts(new Date(Date.UTC(2001, 10, 22)))
    .map(
      (part) =>
        SHORT_DATE_PARTS[part.type] ??
        (/^[/\-. ]*$/.test(part.value) ? part.value : literal(part.value)),
    )
    .join('');
  SHORT_DATES.set(locale, code);
  return code;
}

const accountingCode = (symbol: string, dp: number) => {
  const sym = literal(symbol);
  const digits = `#,##0${decimalsCode(dp)}`;
  return `_(${sym}* ${digits}_);_(${sym}* \\(${digits}\\);_(${sym}* "-"${'?'.repeat(dp)}_);_(@_)`;
};

/** A cell's number format as the code a file writes; null for Automatic without decimals (General). */
export function formatCodeOf(format: NumberFormat | undefined, locale: string): string | null {
  const kind: NumberFormatKind = format?.nf ?? 'auto';
  const dp = format?.dp ?? 2;
  const symbol = format?.cur ?? DEFAULT_SYMBOL;
  switch (kind) {
    case 'auto':
      return format?.dp === undefined ? null : `0${decimalsCode(format.dp)}`;
    case 'number':
      return `#,##0${decimalsCode(dp)}`;
    case 'percent':
      return `0${decimalsCode(dp)}%`;
    case 'scientific':
      return `0${decimalsCode(dp)}E+00`;
    case 'currency':
      return `${literal(symbol)}#,##0${decimalsCode(dp)}`;
    case 'accounting':
      return accountingCode(symbol, dp);
    case 'financial':
      return `#,##0${decimalsCode(dp)};(#,##0${decimalsCode(dp)})`;
    case 'date':
      return shortDateCode(locale);
    case 'time':
      return 'hh:mm:ss';
    case 'datetime':
      return `${shortDateCode(locale)} hh:mm`;
    case 'duration':
      return '[h]:mm:ss';
    case 'text':
      return '@';
    case 'custom':
      return format?.nc ?? null;
  }
}

const dpOf = (zeros: string | undefined) => zeros?.length ?? 0;

// A digits code with its decimals: `0.00%` is Percent with 2.
const DIGIT_FORMS: readonly [RegExp, NumberFormatKind][] = [
  [/^0(?:\.(0+))?$/, 'auto'],
  [/^#,##0(?:\.(0+))?$/, 'number'],
  [/^0(?:\.(0+))?%$/, 'percent'],
  [/^0(?:\.(0+))?E\+00$/, 'scientific'],
];

// A currency's three spellings (D91): `"£"#,##0.00`, `[$£-809]#,##0.00`, and a bare `$` or other non-ASCII symbol.
const CURRENCY = /^(?:"([^"]+)"|\[\$([^\]-]+)(?:-[0-9A-Fa-f]+)?\]|(\$|[^ -~]+))#,##0(?:\.(0+))?$/;
const ACCOUNTING = /^_\("([^"]+)"\* #,##0(?:\.(0+))?_\);/;
const FINANCIAL = /^#,##0(?:\.(0+))?;\(#,##0(?:\.(0+))?\)$/;
const FIXED: Readonly<Record<string, NumberFormatKind>> = {
  'hh:mm:ss': 'time',
  '[h]:mm:ss': 'duration',
  '@': 'text',
};

// The format, when its decimals and symbol are ones a cell may hold.
function held(format: NumberFormat): NumberFormat | null {
  if (format.dp !== undefined && !validFormatValue('dp', format.dp)) return null;
  if (format.cur !== undefined && !validFormatValue('cur', format.cur)) return null;
  return format;
}

function modelFormat(code: string, locale: string): NumberFormat | null {
  for (const [form, nf] of DIGIT_FORMS) {
    const m = form.exec(code);
    if (m) return held({ nf, dp: dpOf(m[1]) });
  }
  const currency = CURRENCY.exec(code);
  if (currency)
    return held({
      nf: 'currency',
      cur: currency[1] ?? currency[2] ?? currency[3],
      dp: dpOf(currency[4]),
    });
  const accounting = ACCOUNTING.exec(code);
  if (accounting) {
    const format = held({ nf: 'accounting', cur: accounting[1], dp: dpOf(accounting[2]) });
    if (format && formatCodeOf(format, locale) === code) return format;
  }
  const financial = FINANCIAL.exec(code);
  if (financial && financial[1] === financial[2])
    return held({ nf: 'financial', dp: dpOf(financial[1]) });
  const fixed = FIXED[code];
  if (fixed) return { nf: fixed };
  const date = shortDateCode(locale);
  if (code === date) return { nf: 'date' };
  if (code === `${date} hh:mm`) return { nf: 'datetime' };
  return null;
}

/** A code from a file as a cell's number format (none for General), or unread when `TEXT` cannot take it. */
export function formatFromCode(code: string, locale: string): CodeRead {
  if (code === '' || code.toLowerCase() === GENERAL.toLowerCase())
    return { ok: true, format: undefined };
  const format = modelFormat(code, locale);
  if (format) return { ok: true, format };
  return formatCodeReads(code) ? { ok: true, format: { nf: 'custom', nc: code } } : { ok: false };
}
