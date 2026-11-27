// Table charts (docs/specs/009-elements/pie-chart.md "Table", D374): a line chart's data written as a table, a header
// row naming the series (the first column the horizontal axis title), a row per category, the categories
// left-aligned and the values right-aligned, a faint band on every second row, the rows that do not fit counted in
// the last that does. Laid out once for both renderers. Pure.
import type { ChartRect } from './chart-frame';
import { scorecardNumber } from './chart-scorecard';
import { chartTypeOf } from './chart-types';
import { chartValueFontPx } from './chart-values';
import {
  chartValue,
  LINE_DEFAULT_CATEGORIES,
  LINE_DEFAULT_SERIES,
  type LineSeries,
} from './data-shapes';
import { textAdvanceEm } from './text-advance';

/** Whether a chart draws as a Table. */
export const isTableChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'table';

/** The band behind every second row, and a row's height as a share of the value size. */
export const TABLE_BAND = '#f1f5f9';
export const TABLE_ROW_SHARE = 1.8;
/** The least share of the width the first (category) column takes. */
export const TABLE_FIRST_SHARE_MIN = 0.25;
// A cell's inner padding, in px, and how much wider the bold header reads.
const PAD = 6;
const BOLD = 1.05;

export type TableCell = { x: number; y: number; text: string; anchor: 'start' | 'end' };

export type TableMarks = {
  header: TableCell[];
  rows: TableCell[][];
  // The banded rows' rectangles.
  bands: ChartRect[];
  // The line under the header.
  rule: { x1: number; x2: number; y: number };
  rowH: number;
};

/** `text` as it fits `width` px at `px`, cut with an ellipsis when it runs on. */
export function fitText(text: string, width: number, px: number): string {
  if (textAdvanceEm(text) * px <= width) return text;
  let cut = text;
  while (cut.length > 0 && (textAdvanceEm(cut) + textAdvanceEm('…')) * px > width)
    cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** The table a chart's data writes in `area` (offset by `ox`, `oy`), at the chart's value size `px`. */
export function tableMarks(
  area: ChartRect,
  categories: readonly string[],
  series: readonly LineSeries[],
  xTitle: string,
  ox = 0,
  oy = 0,
  px = chartValueFontPx(undefined),
): TableMarks {
  const cats = categories.length > 0 ? categories : LINE_DEFAULT_CATEGORIES;
  const cols = series.length > 0 ? series : LINE_DEFAULT_SERIES;
  const rowH = Math.round(px * TABLE_ROW_SHARE);
  const capacity = Math.max(0, Math.floor((area.h - rowH) / rowH));
  // Rows past the plot: the last row that fits counts them instead.
  const over = cats.length > capacity;
  const shown = over ? Math.max(0, capacity - 1) : cats.length;
  const body = cats.slice(0, shown).map((c, i) => [
    c,
    ...cols.map((s) => {
      const v = chartValue(s.values[i]);
      return v === null ? '' : scorecardNumber(v);
    }),
  ]);
  const head = [xTitle, ...cols.map((s) => s.name)];
  // Each column's share by its longest text, the header read bold; the first takes at least its floor.
  const weights = head.map((h, j) =>
    Math.max(1, textAdvanceEm(h) * BOLD, ...body.map((r) => textAdvanceEm(r[j]!))),
  );
  const total = weights.reduce((a, w) => a + w, 0);
  const firstShare = Math.max(TABLE_FIRST_SHARE_MIN, weights[0]! / total);
  const rest = total - weights[0]!;
  const widths = weights.map((w, j) =>
    j === 0 ? area.w * firstShare : (area.w * (1 - firstShare) * w) / rest,
  );
  const lefts = widths.map((_, j) => widths.slice(0, j).reduce((a, w) => a + w, 0));
  const x0 = ox + area.x;
  const y0 = oy + area.y;
  const cell = (text: string, j: number, row: number): TableCell => {
    const start = j === 0;
    return {
      x: x0 + lefts[j]! + (start ? PAD : widths[j]! - PAD),
      y: y0 + row * rowH + rowH / 2 + px * 0.35,
      text: fitText(text, widths[j]! - 2 * PAD, px),
      anchor: start ? 'start' : 'end',
    };
  };
  const rows = body.map((r, i) => r.map((t, j) => cell(t, j, i + 1)));
  if (over && capacity > 0) {
    // The count spans the whole row.
    const more = `+ ${cats.length - shown} more rows`;
    rows.push([{ ...cell('', 0, shown + 1), text: fitText(more, area.w - 2 * PAD, px) }]);
  }
  const bands = rows
    .map((_, i) => i)
    .filter((i) => i % 2 === 1)
    .map((i) => ({ x: x0, y: y0 + (i + 1) * rowH, w: area.w, h: rowH }));
  return {
    header: head.map((t, j) => cell(t, j, 0)),
    rows,
    bands,
    rule: { x1: x0, x2: x0 + area.w, y: y0 + rowH },
    rowH,
  };
}
