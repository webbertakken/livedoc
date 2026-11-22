// A CSV or TSV opened as a new spreadsheet (docs/specs/029-sheets/files-and-print.md "Import", D117) and a sheet
// downloaded as one ("Download", D118). Its text read in the encoding its bytes are in, split by its separator, and
// each value read as if typed in the workbook's locale, into one sheet named after the file; cut at the workbook's
// limits as any file is, each cut named.
import { parseCsv } from '../csv';

import type { SheetsCtx } from '../formula/stored';
import type { Rand } from '../ids';
import { emptySheet, type CellFormat, type CellInput, type Sheet } from '../sheet';
import { sheetsCtxOf } from '../engine/sheets-ctx';
import { SheetLimits } from '../sheet-limits';
import { sheetText } from '../sheet-text';
import { decodeTextFile, type TextEncodingName } from '../text-decoding';
import { readTypedInput } from '../typed-input';
import type { WorkbookRecord } from '../workbook-record';
import { WORKBOOK_COLS_MAX, WORKBOOK_ROWS_MAX } from '../workbook/workbook-limits';
import {
  sheetsFromFile,
  type FileLoss,
  type SheetFromFile,
  type SheetsFromFile,
} from './workbook-file';
import { workbookEngine } from './write-workbook';

/** How a text file's values are split: by the separator it was written with (a `.csv`), or by tabs. */
export type TextFileSplit = 'detect' | 'tab';

/** The split a text file's name asks for: a `.csv` detected, a `.tsv` or `.txt` by tabs; null for no text file. */
export function textFileSplitOf(fileName: string): TextFileSplit | null {
  const ext = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase();
  if (ext === 'csv') return 'detect';
  return ext === 'tsv' || ext === 'txt' ? 'tab' : null;
}

export type SheetsFromText = SheetsFromFile & { encoding: TextEncodingName };

// A value as typed: a formula or a literal with its format hint; one that cannot be read is its text, cut to what a
// cell holds.
function typed(
  text: string,
  locale: string,
  ctx: SheetsCtx,
): { i: CellInput; f?: CellFormat; cut: boolean } | null {
  const read = readTypedInput(text, locale, ctx);
  if (read.kind === 'clear') return null;
  if (read.kind === 'invalid') {
    const max = SheetLimits.spreadsheet.input;
    return { i: { s: text.slice(0, max) }, cut: text.length > max };
  }
  return {
    i: read.input,
    ...(read.hint
      ? { f: { nf: read.hint.nf, ...(read.hint.cur ? { cur: read.hint.cur } : {}) } }
      : {}),
    cut: false,
  };
}

/** The one sheet a CSV or TSV makes, named `name`, each value read as typed in `locale`, what it lost named. */
export function sheetsFromText(
  bytes: Uint8Array,
  split: TextFileSplit,
  name: string,
  locale: string,
  rand: Rand = Math.random,
): SheetsFromText {
  const { text, encoding } = decodeTextFile(bytes);
  const parsed = parseCsv(text, split === 'tab' ? '\t' : undefined, {
    rows: WORKBOOK_ROWS_MAX,
    cols: WORKBOOK_COLS_MAX,
  });
  const width = parsed.rows.reduce((w, row) => Math.max(w, row.length), 0);
  // A read cut at a bound held more than it kept there: one more line, so the cut is named as any file's is.
  const held = (n: number, max: number) => (parsed.truncated && n >= max ? n + 1 : n);
  // The grid as any file's: at least a new sheet's, cut at the workbook's limits and named (workbook-file.ts).
  const made = sheetsFromFile(
    {
      sheets: [
        {
          name,
          rows: held(parsed.rows.length, WORKBOOK_ROWS_MAX),
          cols: held(width, WORKBOOK_COLS_MAX),
          cells: [],
        },
      ],
    },
    locale,
    rand,
  );
  const losses: FileLoss[] = [...made.losses];
  const sheet = made.sheets[0]!;
  const { rows, cols } = { rows: sheet.layout.rows.length, cols: sheet.layout.cols.length };
  const own = emptySheet({ id: sheet.id, tabId: '', title: sheet.title, layout: sheet.layout });
  const ctx = sheetsCtxOf(new Map([[own.id, own]]), own.id, SheetLimits.spreadsheet.input);
  const cells: SheetFromFile['cells'] = [];
  let cut = 0;
  for (const [r, row] of parsed.rows.slice(0, rows).entries())
    for (const [c, field] of row.slice(0, cols).entries()) {
      const value = typed(field, locale, ctx);
      if (!value) continue;
      if (value.cut) cut++;
      cells.push({
        r: sheet.layout.rows[r]!,
        c: sheet.layout.cols[c]!,
        i: value.i,
        ...(value.f ? { f: value.f } : {}),
      });
    }
  if (cut > 0) losses.push({ k: 'text_cut', sheet: sheet.title, cells: cut });
  return { sheets: [{ ...sheet, cells }], losses, encoding };
}

/**
 * The open sheet (by its tab) as a download's CSV or TSV, values as shown, with the sheet's title; null when no sheet
 * is on that tab.
 */
export function writeSheetText(
  sheets: readonly Sheet[],
  record: WorkbookRecord,
  tabId: string,
  sep: ',' | '\t',
): { text: string; title: string } | null {
  const sheet = sheets.find((s) => s.tabId === tabId);
  if (!sheet) return null;
  return { text: sheetText(workbookEngine(sheets, record), sheet, sep), title: sheet.title };
}
