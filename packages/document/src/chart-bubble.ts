// A Bubble chart (docs/specs/009-elements/pie-chart.md "Bubble", D297): a scatter chart's data, each point a circle
// whose area is in proportion to its size. With two or more series the last is the sizes, shared by every other
// series; with one, every bubble is one size. Laid out once for both renderers as LineMarks over the drawn series (a
// scatter's, over the plot drawn in by the largest radius so no bubble hangs past the axes) with the bubbles beside
// them, largest first. Pure; `ox` / `oy` shift every point.
import type { ChartRect } from './chart-frame';
import { lineMarks, type LineMarks } from './chart-marks';
import { chartTypeOf } from './chart-types';
import { shortNumber, type ChartValueLabel } from './chart-values';
import { chartValue, type LineSeries } from './data-shapes';
import { textAdvanceEm } from './text-advance';

/** Whether a chart draws as a Bubble chart. */
export const isBubbleChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'bubble';

// The largest bubble's radius: this share of the plot's shorter side, held between the least and the most (D297).
export const BUBBLE_PLOT_SHARE = 0.1;
export const BUBBLE_RADIUS_MIN = 6;
export const BUBBLE_RADIUS_MAX = 30;
// A bubble's fill, over what it covers (D297).
export const BUBBLE_FILL_OPACITY = 0.6;
// A name in a bubble: its size, and the room it leaves either side.
export const BUBBLE_NAME_FONT_PX = 9;
const NAME_ROOM = 2;
// Show Values' gap over a bubble's top edge.
const VALUE_GAP = 4;

/** A chart's series split as a Bubble chart reads them: those drawn, and the sizes (the last of two or more). */
export function bubbleSeriesOf(series: readonly LineSeries[]): {
  drawn: readonly LineSeries[];
  sizes: LineSeries | null;
} {
  return series.length >= 2
    ? { drawn: series.slice(0, -1), sizes: series.at(-1)! }
    : { drawn: series, sizes: null };
}

export type Bubble = { s: number; i: number; x: number; y: number; r: number };

export type BubbleMarks = LineMarks & {
  // Every bubble drawn, largest first, so a small one is never hidden under a large one.
  bubbles: Bubble[];
  // The drawn series, the sizes left out.
  drawn: readonly LineSeries[];
};

/** Each category's radius: in proportion by area to the largest size; null where its size draws no bubble. */
function radii(sizes: LineSeries | null, n: number, largest: number): (number | null)[] {
  if (!sizes) return Array.from({ length: n }, () => largest / 2);
  const values = Array.from({ length: n }, (_c, i) => chartValue(sizes.values[i]));
  const most = Math.max(0, ...values.map((v) => v ?? 0));
  return values.map((v) => (v === null || v <= 0 ? null : largest * Math.sqrt(v / most)));
}

export function bubbleMarks(
  area: ChartRect,
  categories: readonly string[],
  series: readonly LineSeries[],
  ox = 0,
  oy = 0,
  showAxis = false,
): BubbleMarks {
  const { drawn, sizes } = bubbleSeriesOf(series);
  const largest = Math.min(
    BUBBLE_RADIUS_MAX,
    Math.max(BUBBLE_RADIUS_MIN, Math.min(area.w, area.h) * BUBBLE_PLOT_SHARE),
  );
  const inner = {
    x: area.x + largest,
    y: area.y + largest,
    w: area.w - 2 * largest,
    h: area.h - 2 * largest,
  };
  const m = lineMarks(inner, categories, drawn, 'scatter', ox, oy, showAxis);
  const r = radii(sizes, categories.length, largest);
  // A point whose size draws no bubble is no point: no readout, no value.
  const points = m.points.map((pts) => pts.map((p, i) => (p && r[i] !== null ? p : null)));
  const bubbles = points
    .flatMap((pts, s) => pts.flatMap((p, i) => (p ? [{ s, i, x: p.x, y: p.y, r: r[i]! }] : [])))
    // Stable: equal bubbles keep series, then row, order.
    .sort((a, b) => b.r - a.r);
  return {
    ...m,
    plot: {
      x: m.plot.x - largest,
      y: m.plot.y - largest,
      w: m.plot.w + 2 * largest,
      h: m.plot.h + 2 * largest,
    },
    points,
    // A scatter's series drawn as a line is a scatter's alone: a bubble chart joins none.
    lines: drawn.map(() => ''),
    bubbles,
    drawn,
  };
}

/** Show Values: each bubble's value over its top edge. */
export function bubbleValueLabels(m: BubbleMarks): ChartValueLabel[] {
  return m.bubbles.map((b) => ({
    x: b.x,
    y: b.y - b.r - VALUE_GAP,
    text: shortNumber(chartValue(m.drawn[b.s]!.values[b.i])!),
    anchor: 'middle' as const,
  }));
}

export type BubbleName = { s: number; x: number; y: number; text: string };

/** Each named bubble's name in its middle, where it fits; a bubble too small for its name shows it on hover only. */
export function bubbleNames(m: BubbleMarks, names: readonly string[] | undefined): BubbleName[] {
  if (!names) return [];
  return m.bubbles.flatMap((b) => {
    const text = names[b.i] ?? '';
    const fits =
      text !== '' &&
      2 * b.r >= BUBBLE_NAME_FONT_PX + NAME_ROOM &&
      textAdvanceEm(text) * BUBBLE_NAME_FONT_PX <= 2 * (b.r - NAME_ROOM);
    return fits ? [{ s: b.s, x: b.x, y: b.y + BUBBLE_NAME_FONT_PX / 3, text }] : [];
  });
}

/**
 * A bubble's readout: `name, y, x, size` when its point is named, else `x · series: y, size`; with no sizes, the size
 * is left out.
 */
export function bubbleReadout(
  categories: readonly string[],
  series: readonly LineSeries[],
  names: readonly string[] | undefined,
  s: number,
  i: number,
): string {
  const { drawn, sizes } = bubbleSeriesOf(series);
  const y = chartValue(drawn[s]?.values[i]);
  const size = sizes ? chartValue(sizes.values[i]) : null;
  const tail = size === null ? '' : `, ${size}`;
  const name = names?.[i];
  return name
    ? `${name}, ${y}, ${categories[i] ?? ''}${tail}`
    : `${categories[i] ?? ''} · ${drawn[s]?.name ?? ''}: ${y}${tail}`;
}
