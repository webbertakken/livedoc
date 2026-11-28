// Where rows and columns sit on screen: prefix sums of sizes (hidden and
// filtered-out lines are zero), the frozen panes' sizes, the visible window for a scroll position, and the cell
// under a point. Pure, so the grid's maths is tested without a DOM. Under a drawn order (data-tools.md "The drawn
// order") rows are laid out in that order while every position stays the sheet's: read a row's place through
// rowTop and rowEnd, never `rows` by a position.
import {
  DrawnOrder,
  axisOffsets,
  colWidth,
  deepestOf,
  indexAtOffset,
  layoutIndex,
  posRangeOf,
  baseRowHeight,
  type GridRange,
  type RowHeights,
  type SheetLayout,
} from '@livedoc/sheets';

export const ROW_HEADER_PX = 46;
export const COL_HEADER_PX = 24;
// The outline bar (grid-and-editing.md "Groups and the outline", D162): a lane a depth, and room around them.
export const OUTLINE_DEPTH_PX = 12;
export const OUTLINE_BAND_PAD_PX = 4;
const GRID_OVERSCAN = 4;

export type Geometry = {
  rows: Float64Array; // rows[d] is the top of the row drawn d-th; rows[n] the total height
  // The order rows are drawn in, when a view draws its own; null draws the sheet's.
  order: DrawnOrder | null;
  // Where row r is drawn, and the row drawn d-th (the same number without an order).
  drawnOf: (r: number) => number;
  storedAt: (d: number) => number;
  cols: Float64Array;
  frozenRows: number;
  frozenCols: number;
  frozenHeight: number; // px of the frozen rows
  frozenWidth: number;
  // A merge by its top-left "r,c", and every covered position to its top-left.
  merges: Map<string, GridRange>;
  covered: Map<string, string>;
  // Drawn at no height: hidden by someone, collapsed in a group, or left out by the filter.
  hiddenRow: (r: number) => boolean;
  hiddenCol: (c: number) => boolean;
  // Hidden by someone (Hide Rows), so Show Rows brings it back. A row only the filter leaves out is not: its gap in
  // the row numbers shows it, and the filter brings it back (sheet.md "Filter"). Nor is a collapsed group's: its
  // control expands it (grid-and-editing.md "Groups and the outline").
  userHiddenRow: (r: number) => boolean;
  userHiddenCol: (c: number) => boolean;
  // The outline bands left of the row numbers and above the column letters: 0 without groups (D162), kept when the
  // sheet hides its headers (D165).
  bandW: number;
  bandH: number;
  // Everything before the cells: the band, then the row numbers' width and the column letters' height
  // (ROW_HEADER_PX and COL_HEADER_PX, or 0 when the sheet hides its headers, Sheet Settings).
  headW: number;
  headH: number;
};

function outlineBand(layout: SheetLayout, axis: 'r' | 'c'): number {
  const deepest = deepestOf(layout, axis);
  return deepest ? deepest * OUTLINE_DEPTH_PX + OUTLINE_BAND_PAD_PX : 0;
}

// `heightOf` says how tall each row is drawn (rowHeights: an automatic row fits its text, sheet.md "Row height");
// without it, a layout's own sizes.
export function geometryOf(
  layout: SheetLayout,
  filteredOut: ReadonlySet<string> = new Set(),
  heightOf: RowHeights = (id) => baseRowHeight(layout, id),
  order: DrawnOrder | null = null,
): Geometry {
  const ix = layoutIndex(layout);
  const hiddenRows = new Set([...ix.hiddenRows, ...filteredOut]);
  const drawnIds = order ? Array.from(order.storedAt, (r) => layout.rows[r]!) : layout.rows;
  const rows = axisOffsets(drawnIds, heightOf, hiddenRows);
  const cols = axisOffsets(layout.cols, (id) => colWidth(layout, id), ix.hiddenCols);
  const frozenRows = Math.min(layout.frozenRows ?? 0, layout.rows.length);
  const frozenCols = Math.min(layout.frozenCols ?? 0, layout.cols.length);
  const merges = new Map<string, GridRange>();
  const covered = new Map<string, string>();
  for (const m of layout.merges ?? []) {
    const p = posRangeOf(layout, m);
    if (!p) continue;
    const key = `${p.r1},${p.c1}`;
    merges.set(key, p);
    for (let r = p.r1; r <= p.r2; r++)
      for (let c = p.c1; c <= p.c2; c++) covered.set(`${r},${c}`, key);
  }
  const bandW = outlineBand(layout, 'r');
  const bandH = outlineBand(layout, 'c');
  return {
    rows,
    order,
    drawnOf: order ? (r) => order.drawnOf[r] ?? r : (r) => r,
    storedAt: order ? (d) => order.storedAt[d] ?? d : (d) => d,
    cols,
    frozenRows,
    frozenCols,
    frozenHeight: rows[frozenRows]!,
    frozenWidth: cols[frozenCols]!,
    merges,
    covered,
    bandW,
    bandH,
    headW: bandW + (layout.showHeaders === false ? 0 : ROW_HEADER_PX),
    headH: bandH + (layout.showHeaders === false ? 0 : COL_HEADER_PX),
    hiddenRow: (r) => hiddenRows.has(layout.rows[r]!),
    hiddenCol: (c) => ix.hiddenCols.has(layout.cols[c]!),
    userHiddenRow: (r) => ix.handHiddenRows.has(layout.rows[r]!),
    userHiddenCol: (c) => ix.handHiddenCols.has(layout.cols[c]!),
  };
}

// Row r's top and bottom in the grid, wherever it is drawn.
export function rowTop(g: Pick<Geometry, 'rows' | 'drawnOf'>, r: number): number {
  return g.rows[g.drawnOf(r)]!;
}

export function rowEnd(g: Pick<Geometry, 'rows' | 'drawnOf'>, r: number): number {
  return g.rows[g.drawnOf(r) + 1]!;
}

// Stored rows r1..r2 in pieces each drawn side by side (one piece without an order): one box a piece.
export function drawnPieces(g: Geometry, r1: number, r2: number): { r1: number; r2: number }[] {
  return g.order ? DrawnOrder.pieces(g.order, r1, r2) : [{ r1, r2 }];
}

export function totalSize(g: Geometry): { width: number; height: number } {
  return { width: g.cols[g.cols.length - 1]!, height: g.rows[g.rows.length - 1]! };
}

// The merge covering (r, c), as positions, or null.
export function mergeAt(g: Geometry, r: number, c: number): GridRange | null {
  const key = g.covered.get(`${r},${c}`);
  return key ? g.merges.get(key)! : null;
}

// `rows`: the scrolling rows in view, in the order drawn (each by its own number); c1..c2 the scrolling columns.
export type GridWindow = { rows: readonly number[]; c1: number; c2: number };

// Whether a cell is among the scrolling ones in view.
export function inWindow(w: GridWindow, r: number, c: number): boolean {
  return c >= w.c1 && c <= w.c2 && w.rows.includes(r);
}

// The scrolling rows and columns in view (frozen ones are always drawn), plus overscan.
export function visibleWindow(
  g: Geometry,
  scroll: { top: number; left: number },
  view: { width: number; height: number },
): GridWindow {
  const n = g.rows.length - 1;
  const m = g.cols.length - 1;
  const top = g.frozenHeight + scroll.top;
  const left = g.frozenWidth + scroll.left;
  const r1 = Math.max(g.frozenRows, indexAtOffset(g.rows, top) - GRID_OVERSCAN);
  const r2 = Math.min(
    n - 1,
    indexAtOffset(g.rows, top + Math.max(0, view.height - g.frozenHeight)) + GRID_OVERSCAN,
  );
  const c1 = Math.max(g.frozenCols, indexAtOffset(g.cols, left) - GRID_OVERSCAN);
  const c2 = Math.min(
    m - 1,
    indexAtOffset(g.cols, left + Math.max(0, view.width - g.frozenWidth)) + GRID_OVERSCAN,
  );
  const rows: number[] = [];
  for (let d = r1; d <= r2; d++) rows.push(g.storedAt(d));
  return { rows, c1, c2: Math.max(c1 - 1, c2) };
}

// A cell's box in the grid area's own coordinates (0,0 its top-left, under the headers), given the scroll.
export function cellBox(
  g: Geometry,
  r: number,
  c: number,
  scroll: { top: number; left: number },
  span: GridRange | null = null,
): { x: number; y: number; w: number; h: number } {
  const r2 = span ? span.r2 : r;
  const c2 = span ? span.c2 : c;
  // A span's rows from the first drawn to the last drawn (side by side for a merge, which no order splits).
  let y0 = rowTop(g, r);
  let y1 = rowEnd(g, r2);
  if (g.order && r2 > r)
    for (let i = r; i <= r2; i++) {
      y0 = Math.min(y0, rowTop(g, i));
      y1 = Math.max(y1, rowEnd(g, i));
    }
  const x0 = g.cols[c]!;
  const y = r < g.frozenRows ? y0 : y0 - scroll.top;
  const x = c < g.frozenCols ? x0 : x0 - scroll.left;
  return { x, y, w: g.cols[c2 + 1]! - x0, h: y1 - y0 };
}

export type Hit =
  | { kind: 'cell'; r: number; c: number }
  | { kind: 'col'; c: number; edge: boolean }
  | { kind: 'row'; r: number; edge: boolean }
  | { kind: 'corner' }
  // The outline bands (D162): their controls are buttons of their own; the band itself selects nothing.
  | { kind: 'band'; axis: 'r' | 'c' }
  | { kind: 'none' };

const RESIZE_HIT_PX = 4;

function axisAt(
  offsets: Float64Array,
  frozen: number,
  frozenSize: number,
  p: number,
  scroll: number,
): number {
  const at = p < frozenSize ? p : p + scroll;
  const i = indexAtOffset(offsets, at);
  return i < frozen || p >= frozenSize ? i : frozen;
}

// What is under a point in the Sheet's grid frame (x, y from the frame's top-left, headers included).
export function hitTest(
  g: Geometry,
  x: number,
  y: number,
  scroll: { top: number; left: number },
): Hit {
  const inColHead = y < g.headH;
  const inRowHead = x < g.headW;
  if (inColHead && inRowHead) return { kind: 'corner' };
  if (x < g.bandW) return { kind: 'band', axis: 'r' };
  if (y < g.bandH) return { kind: 'band', axis: 'c' };
  const gx = x - g.headW;
  const gy = y - g.headH;
  const total = totalSize(g);
  if (inColHead) {
    if (gx + (gx < g.frozenWidth ? 0 : scroll.left) > total.width) return { kind: 'none' };
    const c = axisAt(g.cols, g.frozenCols, g.frozenWidth, gx, scroll.left);
    const right = (c < g.frozenCols ? g.cols[c + 1]! : g.cols[c + 1]! - scroll.left) - gx;
    const left = gx - (c < g.frozenCols ? g.cols[c]! : g.cols[c]! - scroll.left);
    if (left <= RESIZE_HIT_PX && c > 0) return { kind: 'col', c: c - 1, edge: true };
    return { kind: 'col', c, edge: right <= RESIZE_HIT_PX };
  }
  if (inRowHead) {
    if (gy + (gy < g.frozenHeight ? 0 : scroll.top) > total.height) return { kind: 'none' };
    const d = axisAt(g.rows, g.frozenRows, g.frozenHeight, gy, scroll.top);
    const bottom = (d < g.frozenRows ? g.rows[d + 1]! : g.rows[d + 1]! - scroll.top) - gy;
    const top = gy - (d < g.frozenRows ? g.rows[d]! : g.rows[d]! - scroll.top);
    // The edge above is the bottom of the row drawn before.
    if (top <= RESIZE_HIT_PX && d > 0) return { kind: 'row', r: g.storedAt(d - 1), edge: true };
    return { kind: 'row', r: g.storedAt(d), edge: bottom <= RESIZE_HIT_PX };
  }
  const ax = gx < g.frozenWidth ? gx : gx + scroll.left;
  const ay = gy < g.frozenHeight ? gy : gy + scroll.top;
  if (ax >= total.width || ay >= total.height) return { kind: 'none' };
  const r = g.storedAt(axisAt(g.rows, g.frozenRows, g.frozenHeight, gy, scroll.top));
  const c = axisAt(g.cols, g.frozenCols, g.frozenWidth, gx, scroll.left);
  const m = mergeAt(g, r, c);
  return m ? { kind: 'cell', r: m.r1, c: m.c1 } : { kind: 'cell', r, c };
}

// The scroll that brings (r, c) fully into view, or null when it already is.
export function scrollToReveal(
  g: Geometry,
  r: number,
  c: number,
  scroll: { top: number; left: number },
  view: { width: number; height: number },
): { top: number; left: number } | null {
  let { top, left } = scroll;
  if (r >= g.frozenRows) {
    const y0 = rowTop(g, r) - g.frozenHeight;
    const y1 = rowEnd(g, r) - g.frozenHeight;
    const avail = view.height - g.frozenHeight;
    if (y0 < top) top = y0;
    else if (y1 > top + avail) top = Math.max(0, y1 - avail);
  }
  if (c >= g.frozenCols) {
    const x0 = g.cols[c]! - g.frozenWidth;
    const x1 = g.cols[c + 1]! - g.frozenWidth;
    const avail = view.width - g.frozenWidth;
    if (x0 < left) left = x0;
    else if (x1 > left + avail) left = Math.max(0, x1 - avail);
  }
  return top === scroll.top && left === scroll.left ? null : { top, left };
}

// How many lines a screen holds on one axis, by their average size past the frozen ones.
function pageLines(
  offsets: Float64Array,
  frozen: number,
  frozenSize: number,
  view: number,
): number {
  const avg =
    (offsets[offsets.length - 1]! - frozenSize) / Math.max(1, offsets.length - 1 - frozen);
  return Math.max(1, Math.floor((view - frozenSize) / Math.max(1, avg)));
}

// How many rows a page is, for Page Up / Page Down.
export function pageRows(g: Geometry, viewHeight: number): number {
  return pageLines(g.rows, g.frozenRows, g.frozenHeight, viewHeight);
}

// How many columns a page is, for Alt + Page Up / Page Down.
export function pageCols(g: Geometry, viewWidth: number): number {
  return pageLines(g.cols, g.frozenCols, g.frozenWidth, viewWidth);
}
