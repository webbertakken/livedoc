// A column or bar chart of several series (docs/specs/009-elements/pie-chart.md "Chart types", "Several series on a
// column or bar chart", D281): each category a group of bars side by side, one per series, laid out once for both
// renderers as chart-marks.ts lays out a single series. Pure; `ox` / `oy` shift every point.
import { AXIS_TICK_FONT_PX, AXIS_TICK_GAP, axisLabelRoom, axisScale } from './chart-axis';
import type { ChartRect } from './chart-frame';
import { chartAxisLabel } from './chart-frame';
import type { BarMarks, BarRect } from './chart-marks';
import type { ChartValueLabel } from './chart-values';
import { shortNumber } from './chart-values';
import { chartValue, type LineSeries } from './data-shapes';

/** The share of a category's slot its group of bars takes, and the thickest a bar is drawn. */
export const BAR_GROUP_SHARE = 0.8;
export const BAR_THICK_MAX = 48;
// A category's name: the line chart's x-label size, and the px a glyph of it takes on average.
const NAME_FONT_PX = 9;
const NAME_GLYPH_PX = 5;
const NAME_GAP = 4;

/** Whether a chart draws its series side by side: a column or bar chart holding two or more (D281). */
export const isBarGroupChart = (el: { shape: string; lineSeries?: readonly LineSeries[] }) =>
  el.shape === 'bar-chart' && (el.lineSeries?.length ?? 0) >= 2;

export type BarGroupMarks = Omit<BarMarks, 'bars'> & {
  // By series, then category: null where the series has no value there.
  bars: (BarRect | null)[][];
  // Each category's name, under its group (left of it on a bar chart), cut to its share.
  names: ChartValueLabel[];
};

export function barGroupMarks(
  area: ChartRect,
  categories: readonly string[],
  series: readonly LineSeries[],
  horizontal: boolean,
  ox = 0,
  oy = 0,
  showAxis = false,
): BarGroupMarks {
  let lo = 0;
  let hi = 0;
  for (const s of series)
    for (const raw of s.values) {
      const v = chartValue(raw);
      if (v === null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  if (hi === lo) hi = lo + 1;
  const scale = showAxis ? axisScale(lo, hi) : null;
  const minVal = scale ? scale.min : lo;
  const span = (scale ? scale.max : hi) - minVal;
  const at = (v: number) => (v - minVal) / span;
  const n = Math.max(1, categories.length);
  const k = Math.max(1, series.length);
  // A bar's place in its category's slot: the group centred in it, each bar an equal part.
  const place = (slot: number, i: number, j: number, from: number) => {
    const thick = Math.min((slot * BAR_GROUP_SHARE) / k, BAR_THICK_MAX);
    const start = from + slot * (i + 0.5) - (thick * k) / 2;
    return { start: start + thick * j, thick };
  };
  const barsOf = (draw: (v: number, i: number, j: number) => BarRect) =>
    series.map((s, j) =>
      categories.map((_, i) => {
        const v = chartValue(s.values[i]);
        return v === null ? null : draw(v, i, j);
      }),
    );
  if (horizontal) {
    const padY = Math.min(20, area.h * 0.08);
    const tickRow = scale ? AXIS_TICK_FONT_PX + AXIS_TICK_GAP : 0;
    const longest = categories.reduce((m, c) => Math.max(m, c.length), 0);
    const nameCol = Math.min(area.w * 0.3, longest * NAME_GLYPH_PX + NAME_GAP * 2);
    const leftX = ox + area.x + nameCol + area.w * 0.04;
    const fullW = Math.max(1, ox + area.x + area.w * 0.94 - leftX);
    const xOf = (v: number) => leftX + at(v) * fullW;
    const zeroX = xOf(0);
    const innerH = Math.max(1, area.h - padY * 2 - tickRow);
    const slot = innerH / n;
    const y0 = oy + area.y + padY;
    const room = Math.floor((nameCol - NAME_GAP) / NAME_GLYPH_PX);
    return {
      baseline: { x1: zeroX, y1: y0, x2: zeroX, y2: y0 + innerH },
      bars: barsOf((v, i, j) => {
        const { start, thick } = place(slot, i, j, y0);
        const end = xOf(v);
        return {
          x: Math.min(zeroX, end),
          y: start,
          w: Math.abs(end - zeroX),
          h: thick,
          rx: Math.min(3, thick / 4),
          tip: { x: end, y: start + thick / 2 },
        };
      }),
      origin: { x: zeroX, y: y0 + innerH / 2 },
      floor: leftX,
      axis: {
        ticks: scale?.ticks.map((t) => ({ at: xOf(t.value), text: t.text })) ?? [],
        span: [y0, y0 + innerH],
      },
      names: categories.map((text, i) => ({
        x: leftX - NAME_GAP,
        y: y0 + slot * (i + 0.5) + NAME_FONT_PX * 0.35,
        text: text.length > room ? `${text.slice(0, Math.max(1, room - 1)).trimEnd()}…` : text,
        anchor: 'end' as const,
        category: true,
      })),
    };
  }
  const padX = Math.min(20, area.w * 0.08);
  const tickCol = scale ? axisLabelRoom(scale) : 0;
  const topPad = oy + area.y + area.h * 0.1;
  // The foot keeps a row for the categories' names.
  const footY = oy + area.y + area.h - NAME_FONT_PX - NAME_GAP * 2;
  const innerW = Math.max(1, area.w - padX * 2 - tickCol);
  const slot = innerW / n;
  const fullH = Math.max(1, footY - topPad);
  const yOf = (v: number) => footY - at(v) * fullH;
  const zeroY = yOf(0);
  const x0 = ox + area.x + padX + tickCol;
  return {
    baseline: { x1: x0, y1: zeroY, x2: x0 + innerW, y2: zeroY },
    bars: barsOf((v, i, j) => {
      const { start, thick } = place(slot, i, j, x0);
      const end = yOf(v);
      return {
        x: start,
        y: Math.min(zeroY, end),
        w: thick,
        h: Math.abs(zeroY - end),
        rx: Math.min(3, thick / 4),
        tip: { x: start + thick / 2, y: end },
      };
    }),
    origin: { x: ox + area.x + area.w / 2, y: zeroY },
    floor: footY,
    axis: {
      ticks: scale?.ticks.map((t) => ({ at: yOf(t.value), text: t.text })) ?? [],
      span: [x0, x0 + innerW],
    },
    names: categories.map((text, i) => ({
      x: x0 + slot * (i + 0.5),
      y: footY + NAME_GAP + NAME_FONT_PX,
      // The line chart's cut: a name wider than its share of the plot is shortened.
      text: chartAxisLabel(text, innerW, n + 1),
      anchor: 'middle' as const,
      category: true,
    })),
  };
}

// How far a number stands off its bar.
const GAP = 6;

/** Show Values on a chart of several series: each bar's number past its end, below zero past its foot. */
export function barGroupValueLabels(
  marks: BarGroupMarks,
  series: readonly LineSeries[],
  horizontal: boolean,
  fontPx: number,
): ChartValueLabel[] {
  const out: ChartValueLabel[] = [];
  marks.bars.forEach((bars, j) =>
    bars.forEach((bar, i) => {
      const value = chartValue(series[j]?.values[i]);
      if (!bar || value === null) return;
      const below = value < 0;
      out.push(
        horizontal
          ? {
              x: below ? bar.tip.x - GAP : bar.tip.x + GAP,
              y: bar.tip.y + fontPx * 0.35,
              text: shortNumber(value),
              anchor: below ? 'end' : 'start',
            }
          : {
              x: bar.tip.x,
              y: below ? bar.tip.y + GAP + fontPx : bar.tip.y - GAP,
              text: shortNumber(value),
              anchor: 'middle',
            },
      );
    }),
  );
  return out;
}

/** The font size categories' names are drawn at. */
export const BAR_GROUP_NAME_FONT_PX = NAME_FONT_PX;
