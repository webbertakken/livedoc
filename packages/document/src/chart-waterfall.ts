// Waterfall charts (docs/specs/009-elements/pie-chart.md "Waterfall", D326): a line chart's first series read as
// changes to a running total, each a column floating from the total before it to the total after it, rises and falls
// rises in the series' colour, falls red, a Subtotal column of the end total last, thin connectors from each column's end to the
// next one's start. Laid out once for both renderers on the column chart's span layout (chart-bar-groups.ts). Pure.
import { barSpanMarks, type BarGroupMarks, type BarSpan } from './chart-bar-groups';
import type { ChartRect } from './chart-frame';
import { chartTypeOf } from './chart-types';
import { shortNumber } from './chart-values';
import { chartValue, type LineSeries } from './data-shapes';

/** Whether a chart draws as a Waterfall. */
export const isWaterfallChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'waterfall';

/** The last column's name, and the legend's three keys in mark order: rises, falls, the subtotal. */
export const WATERFALL_TOTAL_LABEL = 'Subtotal';
export const WATERFALL_KEY_LABELS = ['Increase', 'Decrease', WATERFALL_TOTAL_LABEL] as const;
/**
 * A fall's colour, a red that reads as a loss beside any palette, and the subtotal's, a neutral grey; both at least 3:1
 * on white (D326).
 */
export const WATERFALL_FALL_COLOR = '#d93025';
export const WATERFALL_TOTAL_COLOR = '#80868b';

export type WaterfallStepKind = 'rise' | 'fall' | 'total';
export type WaterfallStep = { kind: WaterfallStepKind; from: number; to: number; value: number };

const ROW: Record<WaterfallStepKind, number> = { rise: 0, fall: 1, total: 2 };

/**
 * The first series' steps, one per category (null where it has no value: the total runs on), then the Subtotal: the
 * end total from zero, when any value is there.
 */
export function waterfallSteps(series: readonly LineSeries[], n: number): (WaterfallStep | null)[] {
  const values = series[0]?.values ?? [];
  let total = 0;
  let any = false;
  const steps: (WaterfallStep | null)[] = [];
  for (let i = 0; i < n; i++) {
    const v = chartValue(values[i]);
    if (v === null) {
      steps.push(null);
      continue;
    }
    any = true;
    steps.push({ kind: v < 0 ? 'fall' : 'rise', from: total, to: total + v, value: v });
    total += v;
  }
  steps.push(any ? { kind: 'total', from: 0, to: total, value: total } : null);
  return steps;
}

export type WaterfallConnector = { x1: number; x2: number; y: number };

export type WaterfallMarks = Omit<BarGroupMarks, 'stack'> & {
  // The categories drawn: the chart's, then the Subtotal.
  categories: string[];
  steps: (WaterfallStep | null)[];
  // Three rows (rises, falls, the subtotal) by category, as `bars` is: each step's value in its row, for Show Values.
  rows: LineSeries[];
  // From each column's end level to the next drawn column.
  connectors: WaterfallConnector[];
};

export function waterfallMarks(
  area: ChartRect,
  categories: readonly string[],
  series: readonly LineSeries[],
  ox = 0,
  oy = 0,
  showAxis = false,
): WaterfallMarks {
  const steps = waterfallSteps(series, categories.length);
  const all = [...categories, WATERFALL_TOTAL_LABEL];
  const spans = WATERFALL_KEY_LABELS.map((_k, row) =>
    steps.map((s): BarSpan => (s && ROW[s.kind] === row ? [s.from, s.to] : null)),
  );
  const marks = barSpanMarks(area, all, spans, {
    horizontal: false,
    ox,
    oy,
    showAxis,
    oneBar: true,
  });
  const drawn = steps.flatMap((s, i) => (s ? [{ s, bar: marks.bars[ROW[s.kind]]![i]! }] : []));
  const connectors = drawn.slice(1).map(({ bar }, k) => {
    const before = drawn[k]!;
    return { x1: before.bar.x + before.bar.w, x2: bar.x, y: before.bar.tip.y };
  });
  const rows = WATERFALL_KEY_LABELS.map((name, row) => ({
    name,
    values: steps.map((s) => (s && ROW[s.kind] === row ? s.value : null)),
  }));
  return { ...marks, categories: all, steps, rows, connectors };
}

/** The legend's keys: rises in the series' colour, falls red, the subtotal grey. */
export function waterfallKeys(series: readonly LineSeries[]): { label: string; color?: string }[] {
  const color = series[0]?.color;
  return [
    { label: WATERFALL_KEY_LABELS[0], ...(color ? { color } : {}) },
    { label: WATERFALL_KEY_LABELS[1], color: WATERFALL_FALL_COLOR },
    { label: WATERFALL_KEY_LABELS[2], color: WATERFALL_TOTAL_COLOR },
  ];
}

/** A column's readout: `category · series: change`, the subtotal's `Subtotal: total`. */
export function waterfallReadout(
  m: WaterfallMarks,
  series: readonly LineSeries[],
  i: number,
): string {
  const step = m.steps[i]!;
  if (step.kind === 'total') return `${WATERFALL_TOTAL_LABEL}: ${shortNumber(step.value)}`;
  return `${m.categories[i] || '—'} · ${series[0]?.name ?? ''}: ${shortNumber(step.value)}`;
}
