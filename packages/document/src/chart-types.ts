// Chart types (docs/specs/009-elements/pie-chart.md "Chart types"): how a chart draws its data, named as Google
// Sheets names it. Each is a chart kind (the stored `shape`) and, for all but the first of its kind, a
// `chartVariant`, so every chart made before chart types keeps drawing as it did.
import { chartValue, type LineSeries, type PieSlice } from './data-shapes';

export const CHART_TYPES = [
  'column',
  'bar',
  'line',
  'area',
  'stepped-area',
  'scatter',
  'bubble',
  'pie',
  'doughnut',
  'radar',
  'candlestick',
  'ohlc',
  'histogram',
  'waterfall',
  'treemap',
  'gauge',
  'scorecard',
  'combo',
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_VARIANTS = [
  'horizontal',
  'area',
  'stepped-area',
  'scatter',
  'bubble',
  'doughnut',
  'radar',
  'candlestick',
  'ohlc',
  'histogram',
  'waterfall',
  'treemap',
  'gauge',
  'scorecard',
  'combo',
] as const;
export type ChartVariant = (typeof CHART_VARIANTS)[number];

type ChartKind = 'bar-chart' | 'line-chart' | 'pie-chart';

// Each type's kind and variant, in CHART_TYPES order.
const SHAPES: Record<ChartType, { shape: ChartKind; chartVariant?: ChartVariant }> = {
  column: { shape: 'bar-chart' },
  bar: { shape: 'bar-chart', chartVariant: 'horizontal' },
  line: { shape: 'line-chart' },
  area: { shape: 'line-chart', chartVariant: 'area' },
  'stepped-area': { shape: 'line-chart', chartVariant: 'stepped-area' },
  scatter: { shape: 'line-chart', chartVariant: 'scatter' },
  bubble: { shape: 'line-chart', chartVariant: 'bubble' },
  pie: { shape: 'pie-chart' },
  doughnut: { shape: 'pie-chart', chartVariant: 'doughnut' },
  radar: { shape: 'line-chart', chartVariant: 'radar' },
  candlestick: { shape: 'line-chart', chartVariant: 'candlestick' },
  ohlc: { shape: 'line-chart', chartVariant: 'ohlc' },
  histogram: { shape: 'line-chart', chartVariant: 'histogram' },
  waterfall: { shape: 'line-chart', chartVariant: 'waterfall' },
  treemap: { shape: 'pie-chart', chartVariant: 'treemap' },
  gauge: { shape: 'pie-chart', chartVariant: 'gauge' },
  scorecard: { shape: 'line-chart', chartVariant: 'scorecard' },
  combo: { shape: 'line-chart', chartVariant: 'combo' },
};

// The names people see ("Column", and "Column Chart" in a menu that inserts one).
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  column: 'Column',
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  'stepped-area': 'Stepped Area',
  scatter: 'Scatter',
  bubble: 'Bubble',
  pie: 'Pie',
  doughnut: 'Doughnut',
  radar: 'Radar',
  candlestick: 'Candlestick',
  ohlc: 'OHLC',
  histogram: 'Histogram',
  waterfall: 'Waterfall',
  treemap: 'Treemap',
  gauge: 'Gauge',
  scorecard: 'Scorecard',
  combo: 'Combo',
};

// The types whose x is read from numbers, and whose first text column names their points (pie-chart.md "Scatter's
// x", "Bubble").
export function readsXFromNumbers(type: ChartType | null): boolean {
  return type === 'scatter' || type === 'bubble';
}

export function isChartType(v: unknown): v is ChartType {
  return (CHART_TYPES as readonly unknown[]).includes(v);
}

export function isChartVariant(v: unknown): v is ChartVariant {
  return (CHART_VARIANTS as readonly unknown[]).includes(v);
}

const isChartKind = (shape: string): shape is ChartKind =>
  shape === 'bar-chart' || shape === 'line-chart' || shape === 'pie-chart';

// Whether a kind takes a variant: one it does not take draws as the kind's first type.
export function variantFitsKind(shape: string, variant: unknown): boolean {
  if (!isChartKind(shape) || !isChartVariant(variant)) return false;
  return Object.values(SHAPES).some((s) => s.shape === shape && s.chartVariant === variant);
}

// The type a chart draws as; null for an element that is not a chart.
export function chartTypeOf(el: { shape: string; chartVariant?: unknown }): ChartType | null {
  if (!isChartKind(el.shape)) return null;
  const fits = variantFitsKind(el.shape, el.chartVariant) ? el.chartVariant : undefined;
  const found = CHART_TYPES.find(
    (t) => SHAPES[t].shape === el.shape && SHAPES[t].chartVariant === fits,
  );
  return found ?? null;
}

// The kind and variant a type is stored as.
export function chartShapeOf(type: ChartType): { shape: ChartKind; chartVariant?: ChartVariant } {
  return SHAPES[type];
}

type ChartData = {
  shape: string;
  chartVariant?: unknown;
  pieSlices?: PieSlice[];
  lineCategories?: string[];
  lineSeries?: LineSeries[];
};

type ChartTypePatch = {
  shape: ChartKind;
  chartVariant: ChartVariant | undefined;
  pieSlices?: PieSlice[] | undefined;
  lineCategories?: string[] | undefined;
  lineSeries?: LineSeries[] | undefined;
  linePointNames?: string[] | undefined;
};

// The patch that makes `el` draw as `type` (spec "Changing type"): within a kind only the variant; across kinds
// the data moves too, slices to one series named Series 1, or a line chart's first series to slices. Null when
// `el` is not a chart or already is that type.
export function chartTypeChange(el: ChartData, type: ChartType): ChartTypePatch | null {
  const from = chartTypeOf(el);
  if (!from || from === type) return null;
  const to = SHAPES[type];
  const patch: ChartTypePatch = { shape: to.shape, chartVariant: to.chartVariant };
  if (to.shape === el.shape) return patch;
  // A column or bar chart of several series keeps them (D281): a line chart draws them all, a column chart side by side.
  const several = (el.lineSeries?.length ?? 0) >= 2;
  if (to.shape === 'line-chart') {
    // Only when the chart has data of its own: an empty one draws the line chart's sample data, as a new one does.
    if (el.pieSlices?.length && !several) {
      patch.lineCategories = el.pieSlices.map((s) => s.label);
      patch.lineSeries = [{ name: 'Series 1', values: el.pieSlices.map((s) => s.value) }];
    }
    patch.pieSlices = undefined;
    return patch;
  }
  if (el.shape === 'line-chart') {
    const first = el.lineSeries?.[0]?.values;
    if (el.lineCategories?.length && first) {
      patch.pieSlices = el.lineCategories.map((label, i) => {
        // No value stays no value (pie-chart.md "No value is a gap").
        const v = chartValue(first[i]);
        return { label, value: v !== null && to.shape === 'pie-chart' ? Math.max(0, v) : v };
      });
    }
    if (!several || to.shape === 'pie-chart') {
      patch.lineCategories = undefined;
      patch.lineSeries = undefined;
    }
    patch.linePointNames = undefined;
    return patch;
  }
  // A pie draws one series: a bar chart's several go.
  if (to.shape === 'pie-chart' && el.lineSeries) {
    patch.lineCategories = undefined;
    patch.lineSeries = undefined;
  }
  // Pie and bar share their slices; a pie never draws below zero.
  if (to.shape === 'pie-chart' && el.pieSlices?.some((s) => (chartValue(s.value) ?? 0) < 0))
    patch.pieSlices = el.pieSlices.map((s) => {
      const v = chartValue(s.value);
      return { ...s, value: v === null ? null : Math.max(0, v) };
    });
  return patch;
}

// How a line chart draws: as a line, an area, a stepped area or a scatter (its chart type, read for the line kind's
// renderers).
export function lineVariantOf(el: {
  shape: string;
  chartVariant?: unknown;
}): 'line' | 'area' | 'stepped-area' | 'scatter' {
  const type = chartTypeOf(el);
  return type === 'area' || type === 'stepped-area' || type === 'scatter' ? type : 'line';
}
