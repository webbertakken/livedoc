// Candlestick and OHLC charts (docs/specs/009-elements/pie-chart.md "Candlestick and OHLC", D322): a line chart's data
// read as prices, per category its open, high, low and close (high, low and close with three series), each category a
// slot as a column chart's, the value range fitted as a scatter's. Laid out once for both renderers. Pure; `ox` / `oy`
// shift every mark.
import { axisLabelRoom, axisScale } from './chart-axis';
import { chartAxisLabel, type ChartRect } from './chart-frame';
import type { AxisTick } from './chart-marks';
import { chartTypeOf } from './chart-types';
import { shortNumber, type ChartValueLabel } from './chart-values';
import { chartValue, type LineSeries } from './data-shapes';
import { r2 as q } from './svg-render-primitives';

/** Whether a chart draws as a Candlestick or an OHLC chart. */
export const isStockChart = (el: { shape: string; chartVariant?: unknown }) => {
  const type = chartTypeOf(el);
  return type === 'candlestick' || type === 'ohlc';
};

// A candle's body: this share of its slot, at most this wide (D322).
export const STOCK_BODY_SHARE = 0.6;
export const STOCK_BODY_MAX = 24;
// Show Values' gap past a mark's right edge.
const VALUE_GAP = 4;

export type StockPrices = { open: number | null; high: number; low: number; close: number };

/** A category's prices: open, high, low, close from four series or more, high, low, close from three; null for a gap. */
export function stockPrices(series: readonly LineSeries[], i: number): StockPrices | null {
  if (series.length < 3) return null;
  const at = (k: number) => chartValue(series[k]!.values[i]);
  const withOpen = series.length >= 4;
  const [open, high, low, close] = withOpen
    ? [at(0), at(1), at(2), at(3)]
    : [null, at(0), at(1), at(2)];
  if (high === null || low === null || close === null || (withOpen && open === null)) return null;
  return { open, high, low, close };
}

export type StockMark = {
  x: number;
  // The low-to-high line, top to bottom.
  top: number;
  bottom: number;
  // The open's and close's heights (no open with three series).
  open: number | null;
  close: number;
  // Half the body's width; a tick reaches this far.
  half: number;
  rising: boolean;
};

export type StockMarks = {
  plot: ChartRect;
  // Per category, its mark, or null for a gap.
  marks: (StockMark | null)[];
  labels: { x: number; text: string }[];
  axis: { left: AxisTick[]; right: AxisTick[] };
};

export function stockMarks(
  area: ChartRect,
  categories: readonly string[],
  series: readonly LineSeries[],
  ox = 0,
  oy = 0,
  showAxis = false,
): StockMarks {
  const n = categories.length;
  const prices = categories.map((_c, i) => stockPrices(series, i));
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of prices) {
    if (!p) continue;
    for (const v of [p.open, p.high, p.low, p.close]) {
      if (v === null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  // No price at all: the plain 0 to 1 a line chart with none draws.
  if (lo > hi) [lo, hi] = [0, 1];
  const fitted = axisScale(lo, hi, false);
  const padL = showAxis ? axisLabelRoom(fitted) : 10;
  const x0 = ox + area.x + padL;
  const w = Math.max(1, area.w - padL - 8);
  const y0 = oy + area.y + 12;
  const h = Math.max(1, area.h - 12 - 22);
  const yOf = (v: number) => y0 + h - ((v - fitted.min) / (fitted.max - fitted.min)) * h;
  const slot = w / Math.max(1, n);
  const half = Math.min(STOCK_BODY_MAX, slot * STOCK_BODY_SHARE) / 2;
  const xOf = (i: number) => x0 + slot * (i + 0.5);
  return {
    plot: { x: x0, y: y0, w, h },
    marks: prices.map((p, i) =>
      p
        ? {
            x: xOf(i),
            top: yOf(p.high),
            bottom: yOf(p.low),
            open: p.open === null ? null : yOf(p.open),
            close: yOf(p.close),
            half,
            rising: p.open === null || p.close >= p.open,
          }
        : null,
    ),
    labels: categories.map((c, i) => ({ x: xOf(i), text: chartAxisLabel(c, w, n) })),
    axis: {
      left: showAxis ? fitted.ticks.map((t) => ({ y: yOf(t.value), text: t.text })) : [],
      right: [],
    },
  };
}

/** A candle's body from open to close, as a box at least a pixel tall; null with no open. */
export function stockBody(m: StockMark): ChartRect | null {
  if (m.open === null) return null;
  const y = Math.min(m.open, m.close);
  return { x: m.x - m.half, y, w: m.half * 2, h: Math.max(1, Math.abs(m.open - m.close)) };
}

/**
 * A mark's lines as path data: a candle's wick above and below its body; else (OHLC, or a candle with no open) the line
 * from low to high with the open's tick to its left and the close's to its right.
 */
export function stockPath(m: StockMark, candle: boolean): string {
  const v = (y1: number, y2: number) => `M ${q(m.x)} ${q(y1)} L ${q(m.x)} ${q(y2)}`;
  if (candle && m.open !== null)
    return `${v(m.top, Math.min(m.open, m.close))} ${v(Math.max(m.open, m.close), m.bottom)}`;
  const open = m.open === null ? '' : ` M ${q(m.x - m.half)} ${q(m.open)} L ${q(m.x)} ${q(m.open)}`;
  return `${v(m.top, m.bottom)}${open} M ${q(m.x)} ${q(m.close)} L ${q(m.x + m.half)} ${q(m.close)}`;
}

/** Show Values: each mark's close to its right. */
export function stockValueLabels(m: StockMarks, series: readonly LineSeries[]): ChartValueLabel[] {
  return m.marks.flatMap((mark, i) =>
    mark
      ? [
          {
            x: mark.x + mark.half + VALUE_GAP,
            y: mark.close + 3,
            text: shortNumber(stockPrices(series, i)!.close),
            anchor: 'start' as const,
          },
        ]
      : [],
  );
}

/** A mark's readout: `category · Open o, High h, Low l, Close c`, no Open with three series. */
export function stockReadout(
  categories: readonly string[],
  series: readonly LineSeries[],
  i: number,
): string {
  const p = stockPrices(series, i)!;
  const open = p.open === null ? '' : `Open ${p.open}, `;
  return `${categories[i] ?? ''} · ${open}High ${p.high}, Low ${p.low}, Close ${p.close}`;
}
