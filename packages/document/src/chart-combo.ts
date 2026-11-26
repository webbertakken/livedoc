// A Combo chart (docs/specs/009-elements/pie-chart.md "Chart types", "Combo", D286): a line chart's data, each series
// drawn as its own series type, Column, Line or Area, over one row of category slots. Its columns are clustered in each
// slot as a column chart's several series are; its lines' and areas' points sit at the slots' middles. Laid out once
// for both renderers, as LineMarks with the columns beside them, so the line chart's axes, labels and values draw it.
// Pure; `ox` / `oy` shift every point.
import { axisLabelRoom, axisScale, rightAxisSeries } from './chart-axis';
import { BAR_GROUP_SHARE, BAR_THICK_MAX } from './chart-bar-groups';
import type { ChartRect } from './chart-frame';
import { chartAxisLabel } from './chart-frame';
import { runsOf, type BarRect, type ChartPoint, type LineMarks } from './chart-marks';
import { smoothPath } from './chart-smooth';
import { chartTypeOf } from './chart-types';
import { shortNumber, type ChartValueLabel } from './chart-values';
import { chartValue, type ChartKeyItem, type LineSeries } from './data-shapes';
import { r2 as q } from './svg-render-primitives';

/** A Combo chart's series types, as Google Sheets offers them (Step Area waits on a file holding it). */
export const COMBO_SERIES_TYPES = ['column', 'line', 'area'] as const;
export type ComboSeriesType = (typeof COMBO_SERIES_TYPES)[number];

export const COMBO_SERIES_TYPE_LABELS: Record<ComboSeriesType, string> = {
  column: 'Column',
  line: 'Line',
  area: 'Area',
};

export function isComboSeriesType(v: unknown): v is ComboSeriesType {
  return (COMBO_SERIES_TYPES as readonly unknown[]).includes(v);
}

/** Whether a chart draws as a Combo chart. */
export const isComboChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'combo';

/**
 * Each series' type as a Combo chart draws it: its own, else the default (D286), the first half of the series,
 * rounded up, columns and the rest lines.
 */
export function comboSeriesTypes(series: readonly { type?: unknown }[]): ComboSeriesType[] {
  const columns = Math.ceil(series.length / 2);
  return series.map((s, i) =>
    isComboSeriesType(s.type) ? s.type : i < columns ? 'column' : 'line',
  );
}

export type ComboMarks = LineMarks & {
  // Each series' type, resolved.
  types: ComboSeriesType[];
  // By series, then category: a column series' columns (null where it has no value), empty for the others.
  bars: (BarRect | null)[][];
};

// Room under the plot for the categories' names, and the plot's top air, as a line chart keeps.
const PAD_TOP = 12;
const PAD_BOTTOM = 22;

export function comboMarks(
  area: ChartRect,
  categories: readonly string[],
  series: readonly LineSeries[],
  ox = 0,
  oy = 0,
  showAxis = false,
  smooth = false,
): ComboMarks {
  const n = categories.length;
  const types = comboSeriesTypes(series);
  const onRight = rightAxisSeries(series);
  // Each axis runs over its own series' values, zero always in it; with Show Axis, to round ticks.
  const range = (right: boolean) => {
    let lo = 0;
    let hi = 0;
    series.forEach((s, j) => {
      if (onRight[j] !== right) return;
      for (const raw of s.values) {
        const v = chartValue(raw);
        if (v === null) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    });
    if (hi === lo) hi = lo + 1;
    if (!showAxis) return { min: lo, max: hi, scale: null };
    const scale = axisScale(lo, hi);
    return { min: scale.min, max: scale.max, scale };
  };
  const left = range(false);
  const right = onRight.some(Boolean) ? range(true) : null;
  const padL = left.scale ? axisLabelRoom(left.scale) : 10;
  const padR = right?.scale ? axisLabelRoom(right.scale) : 8;
  const x0 = ox + area.x + padL;
  const w = Math.max(1, area.w - padL - padR);
  const y0 = oy + area.y + PAD_TOP;
  const h = Math.max(1, area.h - PAD_TOP - PAD_BOTTOM);
  const yOn = (r: { min: number; max: number }) => (v: number) =>
    y0 + h - ((v - r.min) / (r.max - r.min)) * h;
  const yLeft = yOn(left);
  const yRight = right ? yOn(right) : yLeft;
  const yOf = (j: number) => (onRight[j] ? yRight : yLeft);
  const slot = w / Math.max(1, n);
  const mid = (i: number) => x0 + slot * (i + 0.5);

  // The column series share each slot, an equal part each, the group centred in it.
  const columns = types.flatMap((t, j) => (t === 'column' ? [j] : []));
  const thick = Math.min((slot * BAR_GROUP_SHARE) / Math.max(1, columns.length), BAR_THICK_MAX);
  const bars = series.map((s, j) => {
    const k = columns.indexOf(j);
    if (k < 0) return [];
    const y = yOf(j);
    const zero = y(0);
    return categories.map((_c, i): BarRect | null => {
      const v = chartValue(s.values[i]);
      if (v === null) return null;
      const end = y(v);
      const x = mid(i) - (thick * columns.length) / 2 + thick * k;
      return {
        x,
        y: Math.min(zero, end),
        w: thick,
        h: Math.abs(zero - end),
        rx: Math.min(3, thick / 4),
        tip: { x: x + thick / 2, y: end },
      };
    });
  });

  // A line or area series' points at the slots' middles; a column series has none.
  const points = series.map((s, j) =>
    categories.map((_c, i): ChartPoint | null => {
      const v = chartValue(s.values[i]);
      return types[j] === 'column' || v === null ? null : { x: mid(i), y: yOf(j)(v) };
    }),
  );
  const runs = points.map((pts) => runsOf(pts).filter((run) => run.length > 1));
  const straight = (run: readonly ChartPoint[]) =>
    run.map((p, k) => `${k === 0 ? 'M' : 'L'} ${q(p.x)} ${q(p.y)}`).join(' ');
  const lines = runs.map((rs, j) =>
    types[j] === 'column'
      ? ''
      : rs.map(types[j] === 'line' && smooth ? smoothPath : straight).join(' '),
  );
  // An area series fills each run down to its axis's zero.
  const areas = runs.map((rs, j) => {
    if (types[j] !== 'area') return '';
    const zero = q(yOf(j)(0));
    return rs
      .map(
        (run) =>
          `M ${q(run[0]!.x)} ${zero} ${run.map((p) => `L ${q(p.x)} ${q(p.y)}`).join(' ')} L ${q(run.at(-1)!.x)} ${zero} Z`,
      )
      .join(' ');
  });
  return {
    plot: { x: x0, y: y0, w, h },
    points,
    lines,
    areas,
    labels: categories.map((c, i) => ({ x: mid(i), text: chartAxisLabel(c, w, n + 1) })),
    dot: 3,
    axis: {
      left: left.scale?.ticks.map((t) => ({ y: yLeft(t.value), text: t.text })) ?? [],
      right: right?.scale?.ticks.map((t) => ({ y: yRight(t.value), text: t.text })) ?? [],
    },
    types,
    bars,
  };
}

// How far a column's number stands off its end.
const GAP = 6;

/** Show Values on a Combo chart: a column's number past its end (below zero, past its foot), a point's over it. */
export function comboValueLabels(
  marks: ComboMarks,
  series: readonly LineSeries[],
  fontPx: number,
): ChartValueLabel[] {
  return series.flatMap((s, j) =>
    s.values.flatMap((raw, i): ChartValueLabel[] => {
      const v = chartValue(raw);
      if (v === null) return [];
      const bar = marks.bars[j]?.[i];
      if (bar)
        return [
          {
            x: bar.tip.x,
            y: v < 0 ? bar.tip.y + GAP + fontPx : bar.tip.y - GAP,
            text: shortNumber(v),
            anchor: 'middle',
          },
        ];
      // A value with no column is a line or area series' point.
      const p = marks.points[j]![i]!;
      return [{ x: p.x, y: p.y - marks.dot - GAP, text: shortNumber(v), anchor: 'middle' }];
    }),
  );
}

/** A Combo chart's key: a column or area series by a square, a line series by a line through a dot. */
export function comboKeyItems(series: readonly LineSeries[]): ChartKeyItem[] {
  const types = comboSeriesTypes(series);
  return series.map((s, j) => ({
    label: s.name,
    ...(s.color ? { color: s.color } : {}),
    ...(types[j] === 'line' ? { line: true } : {}),
  }));
}

/** The mark a readout sits on: a line or area series' point, else a column's end. */
export function comboMarkAt(marks: ComboMarks, j: number, i: number): ChartPoint | null {
  return marks.points[j]?.[i] ?? marks.bars[j]?.[i]?.tip ?? null;
}
