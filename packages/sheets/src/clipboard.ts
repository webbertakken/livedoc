// The clipboard (docs/specs/029-sheets/sheet.md "Clipboard"): a copied range as the sheet's own cells and as
// tab-separated text, and pasted text read back into rows. The HTML table is clipboard-html.ts's to write and
// clipboard-read.ts's to read.
import { formatRange, type GridRange } from './address';
import { displayValue } from './number-format';
import { cellKey, type Cell, type SheetLayout } from './sheet';
import { renderFormula } from './formula/stored';
import { posRangeOf } from './layout';
import { parseCsv, type ParsedCsv } from './csv';
import { SHEET_ROWS_MAX } from './limits';
import type { Workbook } from './engine/workbook';
import { clipLayoutOf, type ClipLayout } from './paste-layout';

export const SHEET_CLIP_TYPE = 'web application/x-livedoc-sheet+json';

export type SheetClip = {
  v: 1;
  rows: number;
  cols: number;
  cells: (Cell | null)[][];
  // What the cells show, for the text and HTML forms (and Paste Values Only).
  values: string[][];
  // Where it came from: a paste of the sheet's own cells shifts formulas by the distance moved.
  from: { sheetId: string; r: number; c: number; range: string };
  cut?: true;
  // Paste Special's Column Widths Only and its rules items (paste-layout.ts); absent from a clip made before them.
  widths?: number[];
  rules?: ClipLayout['rules'];
  // The merges wholly inside the copy, as offsets in it, and each formula's text by `i,j` (the HTML form's).
  merges?: { i1: number; j1: number; i2: number; j2: number }[];
  formulas?: Record<string, string>;
  // The row each copied row came from, when they were not side by side (copied in a drawn order, D494): a formula
  // pasted shifts from its own row.
  fromRows?: number[];
};

export function clipFromRange(
  wb: Workbook,
  sheetId: string,
  range: GridRange,
  cut = false,
): SheetClip | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const rows = Array.from({ length: range.r2 - range.r1 + 1 }, (_, i) => range.r1 + i);
  return {
    ...readRows(wb, sheetId, rows, range, cut),
    ...mergesIn(sheet.layout, range),
    ...clipLayoutOf(sheet.layout, range),
  };
}

/**
 * The rows given, in that order, columns c1..c2, as one block (data-tools.md "The drawn order", D494): rows a view
 * draws side by side though they are not in the sheet. Each keeps where it came from, for a formula's shift; no merge
 * or rule comes with them, as neither spans rows apart.
 */
export function clipFromRows(
  wb: Workbook,
  sheetId: string,
  rows: readonly number[],
  cols: { c1: number; c2: number },
  cut = false,
): SheetClip | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet || rows.length === 0) return null;
  const first = { r1: rows[0]!, r2: rows[0]!, ...cols };
  const { widths } = clipLayoutOf(sheet.layout, first);
  return { ...readRows(wb, sheetId, rows, first, cut), widths, fromRows: [...rows] };
}

// The cells, shown values and formulas of the rows given, columns c1..c2.
function readRows(
  wb: Workbook,
  sheetId: string,
  rows: readonly number[],
  range: GridRange,
  cut: boolean,
): SheetClip {
  const sheet = wb.sheet(sheetId)!;
  const cells: (Cell | null)[][] = [];
  const values: string[][] = [];
  const formulas: Record<string, string> = {};
  const ctx = wb.ctxFor(sheetId);
  rows.forEach((r, i) => {
    const rowCells: (Cell | null)[] = [];
    const rowValues: string[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      const rowId = sheet.layout.rows[r];
      const colId = sheet.layout.cols[c];
      const cell = rowId && colId ? (sheet.cells.get(cellKey(rowId, colId)) ?? null) : null;
      rowCells.push(cell);
      if (cell?.input && 'f' in cell.input)
        formulas[`${i},${c - range.c1}`] = renderFormula(cell.input.f, ctx);
      rowValues.push(
        displayValue(
          wb.value(sheetId, r, c),
          wb.shownFormat(sheetId, r, c, cell?.format),
          wb.locale,
        ).text,
      );
    }
    cells.push(rowCells);
    values.push(rowValues);
  });
  return {
    v: 1,
    rows: rows.length,
    cols: range.c2 - range.c1 + 1,
    cells,
    values,
    from: { sheetId, r: range.r1, c: range.c1, range: formatRange(range) },
    ...(cut ? { cut: true as const } : {}),
    ...(Object.keys(formulas).length ? { formulas } : {}),
  };
}

export function clipToTsv(values: readonly (readonly string[])[]): string {
  return values
    .map((row) => row.map((v) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join('\t'))
    .join('\n');
}

// Pasted plain text as rows: tab-separated when any line holds a tab; comma-separated when there are two lines or
// more and every one splits into the same number (more than one) of fields; else a line a row. One line is never
// read as commas: "Thanks, Sam" pasted on a cell is a sentence, not two columns.
export function readPastedText(text: string): string[][] {
  return parsePastedText(text).rows;
}

// The same, saying whether the text held more rows or columns than a sheet can (the paste is then cut, and says so).
export function parsePastedText(text: string): ParsedCsv {
  const trimmed = text.replace(/\r?\n$/, '');
  if (trimmed === '') return { rows: [['']], truncated: false };
  if (trimmed.includes('\t')) return parseCsv(trimmed, '\t');
  const csv = parseCsv(trimmed, ',');
  // Two LINES, not two records: one quoted record running over lines ("Line one\nline two",B) is CSV too.
  if (
    /\r?\n/.test(trimmed) &&
    csv.rows[0]!.length > 1 &&
    csv.rows.every((r) => r.length === csv.rows[0]!.length)
  )
    return csv;
  const lines = trimmed.split(/\r?\n/);
  return {
    rows: lines.slice(0, SHEET_ROWS_MAX).map((l) => [l]),
    truncated: lines.length > SHEET_ROWS_MAX,
  };
}

// The merges lying wholly inside a copied range, as offsets in it.
function mergesIn(layout: SheetLayout, range: GridRange): Pick<SheetClip, 'merges'> {
  const merges: NonNullable<SheetClip['merges']> = [];
  for (const m of layout.merges ?? []) {
    const b = posRangeOf(layout, m);
    if (b && b.r1 >= range.r1 && b.r2 <= range.r2 && b.c1 >= range.c1 && b.c2 <= range.c2)
      merges.push({
        i1: b.r1 - range.r1,
        j1: b.c1 - range.c1,
        i2: b.r2 - range.r1,
        j2: b.c2 - range.c1,
      });
  }
  return merges.length ? { merges } : {};
}
