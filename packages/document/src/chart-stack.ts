// Stacking (docs/specs/009-elements/pie-chart.md "Chart types", "Stacking", D282): a column or bar chart of two or
// more series, or an area or stepped area chart, drawing its series one on another (Standard) or as shares of each category (100%).
// Where each value's mark starts and ends, worked once for both renderers. Pure.
import { chartTypeOf } from './chart-types';
import { chartValue, type LineSeries } from './data-shapes';

export const CHART_STACKS = ['stacked', 'percent'] as const;
export type ChartStack = (typeof CHART_STACKS)[number];

export function isChartStack(v: unknown): v is ChartStack {
  return (CHART_STACKS as readonly unknown[]).includes(v);
}

/**
 * The stacking a chart draws with: its own, on a column, bar, area or stepped area chart of two or more series; else
 * none.
 */
export function chartStackOf(el: {
  shape: string;
  chartVariant?: string;
  chartStack?: string;
  lineSeries?: readonly LineSeries[];
}): ChartStack | null {
  if (!isChartStack(el.chartStack) || (el.lineSeries?.length ?? 0) < 2) return null;
  const type = chartTypeOf(el);
  return type === 'column' || type === 'bar' || type === 'area' || type === 'stepped-area'
    ? el.chartStack
    : null;
}

export type StackedValues = {
  // By series, then category: where its mark starts and ends along the value axis; null where it has no value.
  starts: (number | null)[][];
  ends: (number | null)[][];
  // By series, then category: the running total after it, no value adding nothing (an area's band tops).
  levels: number[][];
};

/**
 * Each series' values stacked over `count` categories in series order, the first from zero. `split` keeps values
 * below zero in a stack of their own (a column or bar chart); otherwise they run as one total (an area). 100% reads
 * each value as its share of the sum of its category's sizes, in percent.
 */
export function stackedValues(
  series: readonly LineSeries[],
  count: number,
  stack: ChartStack,
  split: boolean,
): StackedValues {
  const starts = series.map(() => new Array<number | null>(count).fill(null));
  const ends = series.map(() => new Array<number | null>(count).fill(null));
  const levels = series.map(() => new Array<number>(count).fill(0));
  for (let i = 0; i < count; i++) {
    const raw = series.map((s) => chartValue(s.values[i]));
    const sizes = raw.reduce<number>((sum, v) => sum + Math.abs(v ?? 0), 0);
    let up = 0;
    let down = 0;
    let level = 0;
    raw.forEach((v, j) => {
      const value = v === null ? null : stack === 'percent' ? (sizes ? (v / sizes) * 100 : 0) : v;
      if (value !== null) {
        const from = !split ? level : value < 0 ? down : up;
        starts[j]![i] = from;
        ends[j]![i] = from + value;
        level += value;
        if (value < 0) down += value;
        else up += value;
      }
      levels[j]![i] = level;
    });
  }
  return { starts, ends, levels };
}
