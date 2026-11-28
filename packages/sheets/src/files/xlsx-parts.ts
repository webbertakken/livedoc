// What an XLSX file's parts share (docs/specs/029-sheets/standard-mapping.md "Values in XLSX"): SpreadsheetML's
// namespace, its cell addresses, the errors Excel knows, its escaped strings, and the fixed parts every file carries.
import { columnIndex, columnLetters } from '../address';
import type { ErrorCode } from '../formula/values';

export const SPREADSHEETML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
export const OFFICE_RELATIONSHIPS_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Excel's longest sheet name (D84). */
export const XLSX_SHEET_NAME_MAX = 31;

/** Days from the 1900 date system's day 0 to the 1904 system's (`workbookPr@date1904`). */
export const DATE1904_OFFSET = 1462;

/** The errors an XLSX cell caches as an error (ECMA-376 Part 1 §18.17.4); another is cached as its text (D82). */
export const XLSX_ERRORS: ReadonlySet<string> = new Set<ErrorCode>([
  '#NULL!',
  '#DIV/0!',
  '#VALUE!',
  '#REF!',
  '#NAME?',
  '#NUM!',
  '#N/A',
]);

/** A cell's address (`B3`) from zero-based row and column. */
export function cellAddress(r: number, c: number): string {
  return `${columnLetters(c)}${r + 1}`;
}

const ADDRESS = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

/** Zero-based row and column of an address (`B3`), or null. */
export function readCellAddress(text: string): { r: number; c: number } | null {
  const m = ADDRESS.exec(text);
  if (!m) return null;
  const r = Number(m[2]) - 1;
  return r < 0 ? null : { r, c: columnIndex(m[1]!.toUpperCase()) };
}

/** A block's size from its range (`B3:C7`), or null. */
export function readBlock(
  text: string,
  at: { r: number; c: number },
): { rows: number; cols: number } | null {
  const [first, last] = text.split(':');
  const from = readCellAddress(first!);
  const to = last === undefined ? from : readCellAddress(last);
  if (!from || !to || from.r !== at.r || from.c !== at.c || to.r < from.r || to.c < from.c)
    return null;
  return { rows: to.r - from.r + 1, cols: to.c - from.c + 1 };
}

// ECMA-376's ST_Xstring: a character XML 1.0 cannot hold is `_xHHHH_`, and a literal `_xHHHH_` escapes its `_`.
const ESCAPE_LOOKALIKE = /^x[0-9A-Fa-f]{4}_/;
const hex4 = (code: number) => code.toString(16).toUpperCase().padStart(4, '0');

function xmlCannotHold(code: number): boolean {
  if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
  return code < 0x20 || code === 0xfffe || code === 0xffff;
}

/** Text as an XLSX string holds it. */
export function toXstring(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const escaped =
      xmlCannotHold(code) || (code === 0x5f && ESCAPE_LOOKALIKE.test(text.slice(i + 1, i + 7)));
    out += escaped ? `_x${hex4(code)}_` : text[i];
  }
  return out;
}

/** An XLSX string's text. */
export function fromXstring(text: string): string {
  return text.replace(/_x([0-9A-Fa-f]{4})_/g, (_, code: string) =>
    String.fromCharCode(parseInt(code, 16)),
  );
}

/** The cell metadata that marks a formula a dynamic array, so Excel spills it (`c@cm="1"`), as Excel writes it. */
