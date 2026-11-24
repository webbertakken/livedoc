// Custom Date and Time's workings (docs/specs/029-sheets/formatting.md "Number formats", D197, D198): a date or time
// code as a row of parts (each a block with its token, or text), read from a code and written back. Pure.
import { formatCodeDraw, serialFromParts, type CellFormat } from '@livedoc/sheets';
import { formatCodeOf } from '@livedoc/sheets/files';

export type DateBlock = 'day' | 'month' | 'year' | 'hour' | 'minute' | 'second' | 'ampm';

export type DatePart =
  { kind: 'block'; block: DateBlock; token: string } | { kind: 'text'; text: string };

/** Each block's name and tokens, in the order Add lists them (D197). */
export const DATE_BLOCKS: Readonly<
  Record<DateBlock, { label: string; tokens: readonly string[] }>
> = {
  day: { label: 'Day', tokens: ['d', 'dd', 'ddd', 'dddd'] },
  month: { label: 'Month', tokens: ['m', 'mm', 'mmm', 'mmmm', 'mmmmm'] },
  year: { label: 'Year', tokens: ['yy', 'yyyy'] },
  hour: { label: 'Hour', tokens: ['h', 'hh'] },
  minute: { label: 'Minute', tokens: ['m', 'mm'] },
  second: { label: 'Second', tokens: ['s', 'ss'] },
  ampm: { label: 'AM/PM', tokens: ['AM/PM', 'A/P'] },
};

/** The presets, in order (D198). */
export const DATE_TIME_PRESETS: readonly string[] = [
  'dd/mm/yyyy',
  'd mmmm yyyy',
  'dddd, d mmmm yyyy',
  'mmmm yyyy',
  'yyyy-mm-dd',
  'hh:mm',
  'hh:mm:ss',
  'h:mm AM/PM',
  'dd/mm/yyyy hh:mm:ss',
];

/** What the examples and the preview draw without a number in the cell: 26 September 2008 15:59:00. */
export const DATE_TIME_SAMPLE = serialFromParts(2008, 9, 26, 15, 59);

const TOKEN = /^(am\/pm|a\/p|y+|m+|d+|h+|s+)/i;
// Text the grammar reads as itself, written bare; any other is quoted.
const SEPARATORS = /^[\s/:,.-]*$/;

type Read = { kind: 'block'; letter: string; token: string } | { kind: 'text'; text: string };

// A code's pieces as written: runs of one letter, AM/PM, and text. Null on what a row cannot hold.
function readPieces(code: string): Read[] | null {
  const out: Read[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i]!;
    if (ch === '"') {
      const end = code.indexOf('"', i + 1);
      if (end < 0) return null;
      out.push({ kind: 'text', text: code.slice(i + 1, end) });
      i = end + 1;
    } else if (ch === '\\' && i + 1 < code.length) {
      out.push({ kind: 'text', text: code[i + 1]! });
      i += 2;
    } else if (ch === '[' || ch === ';' || ch === '0') {
      return null;
    } else {
      const m = TOKEN.exec(code.slice(i));
      if (m) {
        out.push({ kind: 'block', letter: m[1]![0]!.toLowerCase(), token: m[1]! });
        i += m[1]!.length;
      } else {
        out.push({ kind: 'text', text: ch });
        i++;
      }
    }
  }
  return out;
}

const LETTER_BLOCK: Readonly<Record<string, DateBlock>> = {
  d: 'day',
  y: 'year',
  h: 'hour',
  s: 'second',
  a: 'ampm',
};

/** A date or time code as its parts; null when it holds no block or what a row cannot (a bracket, a fraction). */
export function dateParts(code: string): DatePart[] | null {
  const pieces = readPieces(code);
  if (!pieces) return null;
  const blocks = pieces.filter((p) => p.kind === 'block');
  if (blocks.length === 0) return null;
  const parts: DatePart[] = pieces.map((piece) => {
    if (piece.kind === 'text') return piece;
    const at = blocks.indexOf(piece);
    // "m" after an hour or before a second is minutes, as the grammar reads it.
    const minute =
      piece.letter === 'm' && (blocks[at - 1]?.letter === 'h' || blocks[at + 1]?.letter === 's');
    const block =
      piece.letter === 'm' ? (minute ? 'minute' : 'month') : LETTER_BLOCK[piece.letter]!;
    const token = block === 'ampm' ? piece.token.toUpperCase() : piece.token.toLowerCase();
    return { kind: 'block', block, token };
  });
  return parts;
}

const quoted = (text: string) => `"${text.replaceAll('"', '\\"')}"`;

/** The parts as a code: blocks as their tokens, neighbouring text merged, separators bare and other text quoted. */
export function dateCode(parts: readonly DatePart[]): string {
  let out = '';
  let text = '';
  const flush = () => {
    if (text) out += SEPARATORS.test(text) ? text : quoted(text);
    text = '';
  };
  for (const part of parts) {
    if (part.kind === 'text') text += part.text;
    else {
      flush();
      out += part.token;
    }
  }
  flush();
  return out;
}

/** The row the dialog opens with: the cell's format when it is a date or time code, else Date's in the locale. */
export function dateTimeStart(format: CellFormat | undefined, locale: string): DatePart[] {
  const own = formatCodeOf(format, locale);
  return (own ? dateParts(own) : null) ?? dateParts(formatCodeOf({ nf: 'date' }, locale)!)!;
}

/** A block's token drawn from the sample; a Minute beside an hour, so it reads as one. */
export function blockExample(block: DateBlock, token: string): string {
  if (block === 'minute') return formatCodeDraw(DATE_TIME_SAMPLE, `h:${token}`).text.split(':')[1]!;
  return formatCodeDraw(DATE_TIME_SAMPLE, token).text;
}
