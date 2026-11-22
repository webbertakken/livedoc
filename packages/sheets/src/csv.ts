// CSV (docs/specs/029-sheets/sheet.md "CSV"): RFC 4180 both ways, cut at the grid's limits.
import { SHEET_COLS_MAX, SHEET_ROWS_MAX } from './limits';

/** A read: its rows, whether a row or column bound cut it, and whether the cells bound stopped it (`full`). */
export type ParsedCsv = { rows: string[][]; truncated: boolean; full?: boolean };

/**
 * How many rows and columns a read keeps: a Plan Sheet's grid unless a spreadsheet's is asked for; `cells`, the most
 * fields it reads, stops it at the row that would pass them (a file opened, files-and-print.md "Import security").
 */
export type CsvBounds = { rows: number; cols: number; cells?: number };
const SHEET_BOUNDS: CsvBounds = { rows: SHEET_ROWS_MAX, cols: SHEET_COLS_MAX };

// How many lines `separatorOf` reads to choose.
const SEPARATOR_SAMPLE_LINES = 20;

// The separator a file was written with: a tab when the first line holds one; a semicolon (Excel's CSV in locales
// whose decimal mark is a comma) when the first lines, read as RFC 4180 with semicolons, split into the same number
// of fields (more than one) on every line, and read with commas they do not, or into no more (a tie is a
// semicolon file: a comma file holding a semicolon on every line, the same number on each, is the rarer); else a comma. Reading
// the fields rather than counting characters keeps a quoted comma or semicolon out of it, and lets a comma-decimal
// value ("Tea;3,50") or header ("Amount, EUR") stand on a semicolon line.
function separatorOf(body: string): string {
  if (firstRecordHasTab(body)) return '\t';
  let end = -1;
  for (let n = 0; n < SEPARATOR_SAMPLE_LINES; n++) {
    const next = body.indexOf('\n', end + 1);
    if (next < 0) {
      end = body.length;
      break;
    }
    end = next;
  }
  const sample = body.slice(0, end).replace(/\r$/, '');
  if (!sample.includes(';')) return ',';
  const width = (d: string) => {
    const read = readCsv(sample, d);
    // A reading that leaves a quote outside RFC 4180's quoting has cut a quoted field apart: not this separator.
    if (read.stray) return 0;
    // A blank line splits no way at all, so it takes no part.
    const rows = read.rows.filter((r) => r.length > 1 || r[0] !== '');
    const n = rows[0]?.length ?? 0;
    return n > 1 && rows.every((r) => r.length === n) ? n : 0;
  };
  const semicolons = width(';');
  return semicolons > 0 && semicolons >= width(',') ? ';' : ',';
}

// Whether the first record holds a tab outside quotes: one inside a quoted field is the field's, not a separator. A
// quote opens and closes a field, and a doubled one inside it turns twice, so it reads as one record does. Stops at the
// first line break outside quotes, so it costs one record.
function firstRecordHasTab(body: string): boolean {
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (ch === '\t') return true;
    else if (ch === '\n' || ch === '\r') return false;
  }
  return false;
}

// Rows of fields, split by `sep`, else by the separator the text was written with (separatorOf), cut at `bounds`.
export function parseCsv(text: string, sep?: string, bounds: CsvBounds = SHEET_BOUNDS): ParsedCsv {
  const body = text.startsWith('\ufeff') ? text.slice(1) : text;
  const { rows, truncated, full } = readCsv(body, sep ?? separatorOf(body), bounds);
  return full ? { rows, truncated, full } : { rows, truncated };
}

// RFC 4180 read by `d`. `stray`: a quote was taken as text (one mid-field, or text after a field's closing quote),
// which a file written with `d` never holds.
function readCsv(
  body: string,
  d: string,
  bounds: CsvBounds = SHEET_BOUNDS,
): ParsedCsv & { stray: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  let stray = false;
  let truncated = false;
  let full = false;
  let cells = 0;
  let i = 0;
  // A field past the columns kept is never held, so one long line of separators costs nothing.
  const pushField = () => {
    if (row.length < bounds.cols) row.push(field);
    else truncated = true;
    field = '';
    closed = false;
  };
  const endRow = () => {
    pushField();
    cells += row.length;
    if (cells > (bounds.cells ?? Infinity)) full = true;
    else rows.push(row);
    row = [];
  };
  while (i < body.length) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        closed = true;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === d) {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRow();
      if (full) return { rows, truncated, full, stray };
      if (ch === '\r' && body[i + 1] === '\n') i++;
      i++;
      if (rows.length >= bounds.rows) {
        truncated = i < body.length;
        return { rows, truncated, stray };
      }
      continue;
    }
    if (ch === '"' || closed) stray = true;
    field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) endRow();
  return { rows, truncated, full, stray };
}

// A semicolon and a tab are quoted too, though the file is comma-separated: a sheet whose cells hold one would
// otherwise read back as semicolon- or tab-separated (separatorOf).
function quote(field: string): string {
  return /[",;\t\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

// A field a spreadsheet would run as a formula when the file is opened (CSV injection): one starting with = + - @, a
// tab or a carriage return. A number as shown ("-1,200.50", "-£45", "+3%") is left as it is.
const FORMULA_START = /^[=+\-@\t\r]/;
// Each run of spaces has one place to match (after the sign, after a leading currency sign, before a trailing one), so
// a long run of spaces is read once, never backtracked over (a field is user input).
const SHOWN_NUMBER = /^[+-]?\s*(?:\p{Sc}\s*)?[\d.,]+(?:\s*\p{Sc})?%?$/u;

// A field made inert for a download: prefixed with ' so a spreadsheet opening the file shows it as text.
export function csvSafeField(field: string): string {
  return FORMULA_START.test(field) && !SHOWN_NUMBER.test(field) ? `'${field}` : field;
}

// `safe` (every download leaving the app, never a sheet's own round trip): each field a spreadsheet would run as a
// formula is made inert (csvSafeField). `sep` a tab writes TSV, quoted as CSV is, so it reads back whole.
export function toCsv(
  rows: readonly (readonly string[])[],
  opts: { safe?: boolean; sep?: ',' | '\t' } = {},
): string {
  const field = opts.safe ? (f: string) => quote(csvSafeField(f)) : quote;
  const sep = opts.sep ?? ',';
  return rows.map((r) => r.map(field).join(sep)).join('\r\n') + (rows.length ? '\r\n' : '');
}
