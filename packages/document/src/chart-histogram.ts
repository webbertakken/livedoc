// Histogram charts (docs/specs/009-elements/pie-chart.md "Histogram", D324): a line chart's data read as values to
// count. Every series' values together set the buckets, all one size (Google Charts' default rule: as many as the
// square root of the values' count, a round size); each series is counted into them and drawn as a column chart of
// the counts, so both renderers draw it with the column chart's own marks. Pure.
import { chartTypeOf } from './chart-types';
import { shortNumber } from './chart-values';
import { chartValue, LINE_DEFAULT_SERIES, type LineSeries } from './data-shapes';

/** Whether a chart draws as a Histogram. */
export const isHistogramChart = (el: { shape: string; chartVariant?: unknown }) =>
  chartTypeOf(el) === 'histogram';

/** The round sizes a bucket takes, times a power of ten. */
export const HISTOGRAM_BUCKET_STEPS = [1, 2, 2.5, 5, 10] as const;

// Float noise below this share of a unit is not a step over an edge.
const EPSILON = 1e-9;
// A bucket edge as it reads: twelve significant digits, so 0.1 + 0.2 is 0.3 (and never -0).
const exact = (v: number) => Number(v.toPrecision(12)) + 0;

/** `raw` rounded up to 1, 2, 2.5 or 5 times a power of ten. */
export function niceBucketSize(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = HISTOGRAM_BUCKET_STEPS.find((s) => s * power >= raw * (1 - EPSILON))!;
  return exact(step * power);
}

// An edge's name: in full under 10,000 (to six decimals), short above it, as Show Values reads numbers.
const edgeName = (v: number) =>
  Math.abs(v) >= 1e4
    ? shortNumber(v)
    : v.toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: true });

export type HistogramBuckets = {
  start: number;
  size: number;
  // Each bucket's `start–end`.
  names: string[];
  // By series, then bucket: its count, null where it counts nothing (no column).
  counts: (number | null)[][];
};

/** The buckets every series' values share and each series' counts in them; null with no value to count. */
export function histogramBuckets(series: readonly LineSeries[]): HistogramBuckets | null {
  const values = series.map((s) => s.values.map(chartValue).filter((v) => v !== null));
  const all = values.flat();
  if (all.length === 0) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const size = lo === hi ? 1 : niceBucketSize((hi - lo) / Math.ceil(Math.sqrt(all.length)));
  const start = exact(Math.floor(lo / size + EPSILON) * size);
  const n = Math.floor((hi - start) / size + EPSILON) + 1;
  const names = Array.from(
    { length: n },
    (_, i) => `${edgeName(exact(start + i * size))}–${edgeName(exact(start + (i + 1) * size))}`,
  );
  const counts = values.map((vs) => {
    const row = new Array<number>(n).fill(0);
    for (const v of vs) row[Math.min(n - 1, Math.floor((v - start) / size + EPSILON))]! += 1;
    return row.map((c) => (c === 0 ? null : c));
  });
  return { start, size, names, counts };
}

type HistogramFields = {
  shape: string;
  chartVariant?: unknown;
  chartStack?: unknown;
  pieSlices?: unknown;
  lineCategories?: string[];
  lineSeries?: LineSeries[];
};

/**
 * The column chart a histogram draws as: its buckets the categories, a count series per series in its colour, side by
 * side (the variant kept marks it so for one series too); stacking and what only a line chart reads left behind.
 */
export function histogramColumns<E extends HistogramFields>(el: E): E {
  const series = el.lineSeries && el.lineSeries.length > 0 ? el.lineSeries : LINE_DEFAULT_SERIES;
  const buckets = histogramBuckets(series);
  return {
    ...el,
    shape: 'bar-chart',
    chartStack: undefined,
    pieSlices: undefined,
    lineCategories: buckets?.names ?? [],
    lineSeries: series.map((s, j) => ({
      name: s.name,
      values: buckets?.counts[j] ?? [],
      ...(s.color ? { color: s.color } : {}),
    })),
  };
}
