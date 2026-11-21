// How tall a sheet's rows are (docs/specs/029-sheets/sheet.md "Row height"): a row with a size of its own keeps it;
// every other row is automatic, as tall as the tallest text in its cells needs and never shorter than the sheet's
// row height. Worked out from the cells each time and never stored, by measuring text with no DOM (text/), so the
// editor, the api, an agent's write and an export agree on every height, and draw the very lines measured here.
import type { Workbook } from './engine/workbook';
import type { Value } from './formula/values';
import { baseRowHeight, colWidth, layoutIndex, posRangeOf } from './layout';
import { AXIS_SIZE_MAX, ROW_HEIGHT_NEW } from './limits';
import { displayValue } from './number-format';
import { ruleIndex, rulesAt } from './rules/rule-index';
import { validationRuleAt } from './rules/validation';
import { cellKey, type CellFormat, type FormatRule, type Sheet, type SheetLayout } from './sheet';
import { fontPx, lineHeightPx } from './text/text-measure';
import { wrapLines } from './text/wrap-lines';

// The room a cell keeps either side of its text, and at its right for a dropdown's arrow or a filter button.
export const CELL_PAD_PX = 4;
export const DROPDOWN_ROOM_PX = 22;
export const FILTER_ROOM_PX = 20;
// The room an automatic row keeps round its text (D97): one line needs only its own height, so a single line of up
// to 16 points still fits a 28 px row; two or more lines keep 4 px clear above and below.
const ROW_FIT_PAD_PX = 1;
const ROW_FIT_LINES_PAD_PX = 8;

// Every row's height, by row id.
export type RowHeights = (rowId: string) => number;

// How a text is laid out: wrapped in its room; broken only where its line breaks are; or kept to one line.
type Mode = 'wrap' | 'breaks' | 'line';

// What a cell's lines were worked out from, and the lines: kept per cell, so a pass measures only what changed.
type Measured = {
  // What the cell held and where, by identity: the same of each means the same lines, with nothing worked out.
  layout: SheetLayout;
  format: CellFormat | undefined;
  typed: boolean;
  text: string;
  font: string | undefined;
  // What the lines hang on, by value: a layout that changed elsewhere leaves them as they were.
  room: number;
  px: number;
  bold: boolean;
  mode: Mode;
  lines: readonly string[];
};

type SheetMemo = {
  cells: Map<string, Measured>;
  last?: {
    sized: SheetLayout['rowSize'];
    base: number;
    needs: ReadonlyMap<string, number>;
    heights: RowHeights;
  };
};

const MEMOS = new WeakMap<Workbook, Map<string, SheetMemo>>();

function memoOf(wb: Workbook, sheetId: string): SheetMemo {
  let bySheet = MEMOS.get(wb);
  if (!bySheet) {
    bySheet = new Map<string, SheetMemo>();
    MEMOS.set(wb, bySheet);
  }
  let memo = bySheet.get(sheetId);
  if (!memo) {
    memo = { cells: new Map<string, Measured>() };
    bySheet.set(sheetId, memo);
  }
  return memo;
}

// What the fit reads of a layout besides its sizes, worked out once per layout object (a layout is never mutated).
type LayoutFacts = {
  // Every position a merge covers, its top-left included, as `r * cols + c`.
  merged: ReadonlySet<number>;
  // The columns a card table lists: each keeps the dropdown's room.
  tableCols: ReadonlySet<string>;
  // The filter's header row and the columns it spans, as positions.
  filterHead: { r: number; c1: number; c2: number } | null;
  // The format rules whose style is bold: a cell one covers is measured bold, met or not.
  boldRules: readonly FormatRule[];
};

const FACTS = new WeakMap<SheetLayout, LayoutFacts>();

function factsOf(layout: SheetLayout): LayoutFacts {
  let facts = FACTS.get(layout);
  if (facts) return facts;
  const merged = new Set<number>();
  const span = layout.cols.length;
  for (const m of layout.merges ?? []) {
    const p = posRangeOf(layout, m);
    if (!p) continue;
    for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) merged.add(r * span + c);
  }
  const tableCols = new Set<string>();
  for (const table of layout.cardTables ?? []) for (const col of table.cols) tableCols.add(col.c);
  const f = layout.filter ? posRangeOf(layout, layout.filter) : null;
  facts = {
    merged,
    tableCols,
    filterHead: f ? { r: f.r1, c1: f.c1, c2: f.c2 } : null,
    boldRules: (layout.formatRules ?? []).filter((rule) => rule.style?.b),
  };
  FACTS.set(layout, facts);
  return facts;
}

// A text cell's place: its position and its box's width (a merge's, the whole of it).
type Place = { layout: SheetLayout; facts: LayoutFacts; r: number; c: number; width: number };

// The width a cell's text breaks in: its box less its padding and what is kept at its right.
function textRoom({ layout, facts, r, c, width }: Place): number {
  const rule = layout.rules?.length ? validationRuleAt(layout, r, c) : null;
  const arrow = (rule?.is === 'list' || rule?.is === 'range') && rule.show === 'arrow';
  const dropdown = arrow || facts.tableCols.has(layout.cols[c]!) ? DROPDOWN_ROOM_PX : 0;
  const head = facts.filterHead;
  const filter = head && head.r === r && c >= head.c1 && c <= head.c2 ? FILTER_ROOM_PX : 0;
  return width - CELL_PAD_PX * 2 - Math.max(dropdown, filter);
}

// A cell whose value a validation rule draws as a chip or a checkbox: one line, whatever it holds.
function drawnAsControl({ layout, r, c }: Place): boolean {
  const rule = layout.rules?.length ? validationRuleAt(layout, r, c) : null;
  return rule?.is === 'check' || ((rule?.is === 'list' || rule?.is === 'range') && !rule.show);
}

function measuredBold({ layout, facts, r, c }: Place, f: CellFormat | undefined): boolean {
  if (f?.b) return true;
  if (facts.boldRules.length === 0) return false;
  return rulesAt(ruleIndex(layout, facts.boldRules), r, c).length > 0;
}

// The text a cell shows when its value is text, or null: only text wraps and only text holds line breaks.
function shownText(value: Value, f: CellFormat | undefined, locale: string): string | null {
  if (typeof value !== 'string' || value === '') return null;
  return f?.nf === 'custom' && f.nc ? displayValue(value, f, locale).text : value;
}

function linesOf(
  text: string,
  mode: Mode,
  room: number,
  px: number,
  bold: boolean,
  font: string | undefined,
): readonly string[] {
  // Past the lines a row at its tallest shows, nothing more is measured.
  const most = Math.ceil(AXIS_SIZE_MAX / lineHeightPx(px));
  if (mode === 'wrap') return wrapLines(text, room, px, { font, bold }, most);
  if (mode === 'breaks') return text.split('\n', most);
  // A chip shows its text on one line, and so does a formula's text where the cell does not wrap: its line breaks
  // are drawn as spaces.
  return [text.includes('\n') ? text.replace(/\r?\n/g, ' ') : text];
}

// What a text cell holds: its text, its format, whether the text is the cell's own input (`typed`), and the tab's
// font. A typed line break starts a line whether the cell wraps or not; one a formula makes, only where it wraps.
type Held = {
  text: string;
  format: CellFormat | undefined;
  typed: boolean;
  font: string | undefined;
};

// Whether a cell is, by identity, what its lines were last worked out from: then they stand, nothing worked out.
function unchanged(known: Measured, layout: SheetLayout, held: Held): boolean {
  return (
    known.layout === layout &&
    known.format === held.format &&
    known.typed === held.typed &&
    known.text === held.text &&
    known.font === held.font
  );
}

// A text cell's lines: from the memo when what they hang on is unchanged, else worked out and kept.
function measure(
  memo: Map<string, Measured>,
  known: Measured | undefined,
  key: string,
  place: Place,
  held: Held,
): readonly string[] {
  const { text, format: f, typed, font } = held;
  if (known && unchanged(known, place.layout, held)) {
    memo.set(key, known);
    return known.lines;
  }
  const mode: Mode = drawnAsControl(place)
    ? 'line'
    : f?.wr === 'w'
      ? 'wrap'
      : typed
        ? 'breaks'
        : 'line';
  const room = textRoom(place);
  const px = fontPx(f?.fs);
  const bold = measuredBold(place, f);
  const face = f?.ff ?? font;
  const same =
    known &&
    known.text === text &&
    known.mode === mode &&
    known.room === room &&
    known.px === px &&
    known.bold === bold &&
    (known.format?.ff ?? known.font) === face;
  const lines = same ? known.lines : linesOf(text, mode, room, px, bold, face);
  memo.set(key, {
    layout: place.layout,
    format: f,
    typed,
    text,
    font,
    room,
    px,
    bold,
    mode,
    lines,
  });
  return lines;
}

function needOf(lines: number, px: number): number {
  return lines * lineHeightPx(px) + (lines > 1 ? ROW_FIT_LINES_PAD_PX : ROW_FIT_PAD_PX);
}

// Each automatic row that needs more than the sheet's row height, with the height it needs.
function fitNeeds(
  wb: Workbook,
  sheet: Sheet,
  font: string | undefined,
  memo: SheetMemo,
): Map<string, number> {
  const { layout } = sheet;
  const ix = layoutIndex(layout);
  const facts = factsOf(layout);
  const base = layout.rowHeight ?? ROW_HEIGHT_NEW;
  const sized = layout.rowSize;
  const span = layout.cols.length;
  // A cell with no input shows a value only where a formula spills one into it.
  const spills = wb.maySpill(sheet.id);
  const needs = new Map<string, number>();
  const before = memo.cells;
  const cells = new Map<string, Measured>();
  const need = (rowId: string, px: number) => {
    if (px > base && px > (needs.get(rowId) ?? 0)) needs.set(rowId, Math.min(AXIS_SIZE_MAX, px));
  };
  for (const [key, cell] of sheet.cells) {
    const f = cell.format;
    const input = cell.input;
    const px = fontPx(f?.fs);
    const wraps = f?.wr === 'w';
    const tall = needOf(1, px) > base;
    const typed = !!input && 's' in input;
    // Only a cell that wraps, whose font is too tall for the row, or whose own text holds a line break can need more
    // than the sheet's row height: everything else is one line that fits, and is passed by unread.
    if (!wraps && !tall && !(typed && input.s.includes('\n'))) continue;
    if (!input && !spills) continue;
    const colon = key.indexOf(':');
    const rowId = key.slice(0, colon);
    if (sized && sized[rowId] !== undefined) continue;
    const r = ix.rowPos.get(rowId);
    const c = ix.colPos.get(key.slice(colon + 1));
    if (r === undefined || c === undefined || facts.merged.has(r * span + c)) continue;
    // Text typed in is its own value and a number or a true/false is one line: only a formula or a spill is read.
    if (input && !typed && !('f' in input)) {
      need(rowId, needOf(1, px));
      continue;
    }
    const value = typed ? input.s : wb.value(sheet.id, r, c);
    if (value === null || value === '') continue;
    if (tall) need(rowId, needOf(1, px));
    const text = shownText(value, f, wb.locale);
    if (text === null || (!wraps && !typed)) continue;
    const known = before.get(key);
    const held = { text, format: f, typed, font };
    let lines: readonly string[];
    if (known && unchanged(known, layout, held)) {
      cells.set(key, known);
      lines = known.lines;
    } else {
      const place = { layout, facts, r, c, width: colWidth(layout, layout.cols[c]!) };
      lines = measure(cells, known, key, place, held);
    }
    need(rowId, needOf(lines.length, px));
  }
  memo.cells = cells;
  return needs;
}

function sameNeeds(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [rowId, px] of a) if (b.get(rowId) !== px) return false;
  return true;
}

// Every row's height in a sheet, hidden rows aside: a sized row's own, an automatic row's fit. `font` is the tab's
// font id, what a cell with no font of its own is drawn in. The answer is the same function for as long as no
// height changed, so what hangs on it (the grid's geometry) is not worked out again for nothing.
export function rowHeights(wb: Workbook, sheetId: string, font?: string): RowHeights {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return () => ROW_HEIGHT_NEW;
  const { layout } = sheet;
  const memo = memoOf(wb, sheetId);
  const needs = fitNeeds(wb, sheet, font, memo);
  const base = layout.rowHeight ?? ROW_HEIGHT_NEW;
  const last = memo.last;
  if (last && last.sized === layout.rowSize && last.base === base && sameNeeds(last.needs, needs))
    return last.heights;
  const heights: RowHeights = (rowId) => needs.get(rowId) ?? baseRowHeight(layout, rowId);
  memo.last = { sized: layout.rowSize, base, needs, heights };
  return heights;
}

// The lines the text cell at (r, c) draws: wrapped in its room where the cell wraps, else as its own line breaks have
// them. The fit measured these very lines, which is why a row it sized cuts none off.
export function cellLines(
  wb: Workbook,
  sheetId: string,
  r: number,
  c: number,
  text: string,
  font?: string,
): readonly string[] {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return [text];
  const { layout } = sheet;
  const key = cellKey(layout.rows[r]!, layout.cols[c]!);
  const facts = factsOf(layout);
  let width = colWidth(layout, layout.cols[c]!);
  if (facts.merged.has(r * layout.cols.length + c)) {
    const { hiddenCols } = layoutIndex(layout);
    for (const m of layout.merges ?? []) {
      const p = posRangeOf(layout, m);
      if (!p || p.r1 !== r || p.c1 !== c) continue;
      for (let k = c + 1; k <= p.c2; k++)
        if (!hiddenCols.has(layout.cols[k]!)) width += colWidth(layout, layout.cols[k]!);
    }
  }
  const memo = memoOf(wb, sheetId).cells;
  const cell = sheet.cells.get(key);
  const typed = !!cell?.input && 's' in cell.input;
  const place = { layout, facts, r, c, width };
  return measure(memo, memo.get(key), key, place, { text, format: cell?.format, typed, font });
}
