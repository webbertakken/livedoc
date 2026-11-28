// The cells view (docs/specs/024-agents/document-views.md "A spreadsheet's views"): one sheet's range, a row holding
// a non-empty cell a line, each cell its address and input, a formula with what it shows. Values are worked out by
// the editor's engine over the workbook given; the range is bounded as read_sheet's is (5,000 cells), the text by
// SHEET_VIEW_CHARS_MAX on a whole row, and a cut says where to read on.
import type { ViewDoor } from '@livedoc/api-schema';
import {
  cellLinkText,
  formatA1,
  formatRange,
  parseRangeText,
  readRange,
  type AgentValue,
  type Workbook,
} from '@livedoc/sheets';
import { fitLines, fitOf, type ViewLine, type ViewResult } from '../budget';
import { jsonString } from '../text';

// The most characters of rows one cells view prints, as read_sheet answers (sheet-store.md "Agents").
export const SHEET_VIEW_CHARS_MAX = 100_000;

// Asked of a tab that is no spreadsheet's sheet (document-views.md "A spreadsheet's views").
export const CELLS_NOT_SPREADSHEET = "cells reads a spreadsheet's sheet";

export type CellsViewInput = { wb: Workbook; sheetId: string; title: string; range?: string };

// `link`: the cell's own link, a range or sheet of the workbook by name (inserted-objects.md "Links, agents").
export type CellJson = {
  at: string;
  input: string;
  value: AgentValue;
  display: string;
  link?: string;
};
export type CellsRowJson = { row: number; cells: CellJson[] };
export type CellsJson = {
  view: 'cells';
  sheet: string;
  range: string;
  used: string | null;
  rows: CellsRowJson[];
  // The range to read on with, when the view stopped before the end of the range asked.
  next: string | null;
};

export type CellsViewResult =
  ({ ok: true } & ViewResult<CellsJson>) | { ok: false; message: string };

const ROW_LINE = { one: 'row', many: 'rows' };

// A formula prints as typed, with only what could break the line's grammar escaped (I4).
const formulaText = (input: string) =>
  input.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '\\n');

const bare = (value: AgentValue, display: string) =>
  (typeof value === 'number' || typeof value === 'boolean') &&
  display === String(value).toUpperCase()
    ? display
    : jsonString(display);

export function cellText(cell: CellJson): string {
  const text = cellValueText(cell);
  return cell.link === undefined ? text : `${text} ↗ ${jsonString(cell.link)}`;
}

function cellValueText(cell: CellJson): string {
  const { at, input, value, display } = cell;
  if (input.startsWith('=')) return `${at} ${formulaText(input)} → ${bare(value, display)}`;
  // A spilled cell has no input of its own.
  if (input === '') return `${at} → ${bare(value, display)}`;
  if (typeof value === 'string') {
    const typed = jsonString(input);
    return display === input ? `${at} ${typed}` : `${at} ${typed} → ${jsonString(display)}`;
  }
  return display === input ? `${at} ${input}` : `${at} ${input} → ${jsonString(display)}`;
}

export function sheetCellsView(
  input: CellsViewInput,
  opts: { budget?: number; door?: ViewDoor } = {},
): CellsViewResult {
  const { wb, sheetId, title } = input;
  const read = readRange(wb, sheetId, input.range);
  if (!read.ok)
    return { ok: false, message: `range takes an A1 cell or range, like A1:D20: "${input.range}"` };
  const start = parseRangeText(read.range)!;
  const extent = wb.shownExtent(sheetId);
  // The last row the range asked reaches: the used range's when none was named.
  const end = input.range ? parseRangeText(input.range)!.r2 : extent.rows - 1;
  const used =
    extent.rows && extent.cols
      ? formatRange({ r1: 0, c1: 0, r2: extent.rows - 1, c2: extent.cols - 1 })
      : null;
  const rows: CellsRowJson[] = [];
  const lines: ViewLine[] = [];
  let chars = 0;
  let next: number | null = read.truncated ? start.r1 + read.rows.length : null;
  for (const [i, row] of read.rows.entries()) {
    const r = start.r1 + i;
    const cells = row.flatMap((cell, j): CellJson[] => {
      if (cell.input === '' && cell.display === '') return [];
      const ln = wb.cellLinkOf(sheetId, r, start.c1 + j);
      // readRange answers an error as its text, so a value is never an error object.
      const out: CellJson = {
        at: formatA1(r, start.c1 + j),
        ...cell,
        value: cell.value as AgentValue,
      };
      if (ln !== null) out.link = cellLinkText(ln, (id) => wb.sheet(id)?.title);
      return [out];
    });
    if (!cells.length) continue;
    const text = [String(r + 1), ...cells.map(cellText)].join(' | ');
    if (chars + text.length + 1 > SHEET_VIEW_CHARS_MAX) {
      next = r;
      break;
    }
    chars += text.length + 1;
    rows.push({ row: r + 1, cells });
    lines.push({ text, noun: ROW_LINE });
  }
  const nextRange =
    next === null
      ? null
      : formatRange({ r1: next, c1: start.c1, r2: Math.max(end, next), c2: start.c2 });
  const header = `sheet ${jsonString(title)} · cells ${read.range} of ${used ?? 'an empty sheet'}`;
  const fitted = fitLines({
    header,
    lines,
    budget: opts.budget,
    door: opts.door ?? 'cli',
    ...(nextRange ? { closing: `… read on with range ${nextRange}` } : {}),
  });
  return {
    ok: true,
    text: fitted.text,
    json: { view: 'cells', sheet: title, range: read.range, used, rows, next: nextRange },
    fit: fitOf(fitted),
  };
}
