// Where a spreadsheet's chart sits and what a new one is (docs/specs/029-sheets/charts.md "The model", "Inserting"):
// its anchor (a cell by ids and px into it) to and from the grid's px, the type Insert › Chart suggests for a range's
// data, and the chart it makes. Pure.
import { scatterX, type SheetAnchor } from '@livedoc/document';
import {
  cellKey,
  layoutIndex,
  posRangeOf,
  type IdRange,
  type Sheet,
  OBJECT_OFFSET_MAX,
  type CellAnchor,
  type SheetChart,
  type SheetChartTable,
  type SheetChartType,
  type SheetLayout,
} from '@livedoc/sheets';
import type { Geometry } from '@/components/sheets/sheet-geometry';

// A drawn order's mapping when rows are drawn in one (data-tools.md "The drawn order"): an object sits on its row.
type Lines = Pick<Geometry, 'rows' | 'cols'> & Partial<Pick<Geometry, 'drawnOf' | 'storedAt'>>;

// A new chart's size (the agent's SHEET_CHART_SIZE, Google's default proportion).
export const NEW_SHEET_CHART_SIZE = { width: 420, height: 280 } as const;

// The anchor's px from A1's corner; a cell no longer in the sheet reads as A1's.
export function anchorPx(at: CellAnchor, layout: SheetLayout, g: Lines): SheetAnchor {
  const ix = layoutIndex(layout);
  const r = ix.rowPos.get(at.r) ?? 0;
  const c = ix.colPos.get(at.c) ?? 0;
  return { x: (g.cols[c] ?? 0) + at.dx, y: (g.rows[g.drawnOf?.(r) ?? r] ?? 0) + at.dy };
}

// The line a px falls in: the last one drawn at a height whose top is at or before it.
function lineAt(tops: Float64Array, n: number, px: number): number {
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tops[mid]! <= px) lo = mid;
    else hi = mid - 1;
  }
  // Hidden lines take no height: step back to the one drawn there.
  while (lo > 0 && tops[lo + 1]! - tops[lo]! <= 0) lo--;
  return lo;
}

// The anchor for a px from A1's corner: the cell it falls in, and the px into it (within the anchor's bounds).
export function anchorAt(px: SheetAnchor, layout: SheetLayout, g: Lines): CellAnchor {
  const d = lineAt(g.rows, layout.rows.length, Math.max(0, px.y));
  const c = lineAt(g.cols, layout.cols.length, Math.max(0, px.x));
  const into = (v: number) => Math.round(Math.min(OBJECT_OFFSET_MAX, Math.max(0, v)));
  return {
    r: layout.rows[g.storedAt?.(d) ?? d]!,
    c: layout.cols[c]!,
    dx: into(px.x - (g.cols[c] ?? 0)),
    dy: into(px.y - (g.rows[d] ?? 0)),
  };
}

// The type Insert › Chart suggests (Google's rules, charts.md "Inserting"): one series of shares (no negatives) over
// two to eight labelled rows is a pie; numbers against a first column of numbers a scatter; dated labels a line;
// anything else a column chart.
export function suggestChartType(t: SheetChartTable, datedLabels: boolean): SheetChartType {
  const { numbered } = t;
  // Numbers against numbers: a first column the read numbered (no labels), or labels that are all numbers.
  if (
    numbered
      ? t.series.length >= 2
      : t.categories.length > 0 && t.categories.every((c) => scatterX(c) !== null)
  )
    return 'scatter';
  if (datedLabels) return 'line';
  const first = t.series[0]?.values ?? [];
  if (
    !numbered &&
    t.series.length === 1 &&
    first.length >= 2 &&
    first.length <= 8 &&
    first.every((v) => v === null || v >= 0)
  )
    return 'pie';
  return 'column';
}

// A new chart of `type` reading `range` (only `cols` of it when given), its top-left at `at`.
export function newSheetChart(
  id: string,
  type: SheetChartType,
  pick: { range: SheetChart['range'] & object; cols?: string[] },
  at: CellAnchor,
): SheetChart {
  return {
    id,
    kind: 'chart',
    at,
    ...NEW_SHEET_CHART_SIZE,
    type,
    range: pick.range,
    ...(pick.cols ? { cols: pick.cols } : {}),
  };
}

const DATE_KINDS: ReadonlySet<string> = new Set(['date', 'time', 'datetime']);

// Whether the range's first column holds dates: a date format on its first or second row (under a header).
export function labelsAreDates(sheet: Sheet, pick: { range: IdRange }): boolean {
  const at = posRangeOf(sheet.layout, pick.range);
  if (!at) return false;
  const col = sheet.layout.cols[at.c1]!;
  return [at.r1, at.r1 + 1].some((r) => {
    const row = r <= at.r2 ? sheet.layout.rows[r] : undefined;
    const nf = row ? sheet.cells.get(cellKey(row, col))?.format?.nf : undefined;
    return !!nf && DATE_KINDS.has(nf);
  });
}
