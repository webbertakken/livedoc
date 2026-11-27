// docs/specs/009-elements/pie-chart.md "Chart types", "Histogram" (D324): every series values to count, buckets shared
// by every series (the square root of the count of values, a round size), drawn as a column chart of the counts.
import { describe, expect, it } from 'vitest';
import { isBarGroupChart } from './chart-bar-groups';
import {
  histogramBuckets,
  histogramColumns,
  isHistogramChart,
  niceBucketSize,
} from './chart-histogram';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import { LINE_DEFAULT_SERIES, type LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { renderElementsToSvg } from './index';
import { createShape } from './shape-factory';

const S = (name: string, values: (number | null)[]): LineSeries => ({ name, values });
// Google Charts' histogram example: dinosaur lengths in metres, bucketed in tens.
const LENGTHS = [
  12.2, 9.1, 12.2, 22.9, 0.9, 36.6, 9.1, 30.5, 6.1, 2.7, 0.9, 2.7, 27.1, 3.4, 5.5, 21, 7.9, 1.2,
  4.6, 1.5, 7.9, 2, 45.7, 12.2, 30.5, 15.2, 30.5, 1.8,
];

describe('histogram as a chart type', () => {
  it('is a line chart kind with its own variant, named Histogram', () => {
    expect(chartShapeOf('histogram')).toEqual({ shape: 'line-chart', chartVariant: 'histogram' });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'histogram' })).toBe('histogram');
    expect(isHistogramChart({ shape: 'line-chart', chartVariant: 'histogram' })).toBe(true);
    expect(isHistogramChart({ shape: 'bar-chart', chartVariant: 'histogram' })).toBe(false);
    expect(isHistogramChart({ shape: 'line-chart' })).toBe(false);
    expect(CHART_TYPE_LABELS.histogram).toBe('Histogram');
  });
});

describe('niceBucketSize', () => {
  it('rounds up to 1, 2, 2.5 or 5 times a power of ten', () => {
    expect(niceBucketSize(7.47)).toBe(10);
    expect(niceBucketSize(1)).toBe(1);
    expect(niceBucketSize(1.2)).toBe(2);
    expect(niceBucketSize(2.1)).toBe(2.5);
    expect(niceBucketSize(3)).toBe(5);
    expect(niceBucketSize(0.03)).toBe(0.05);
    expect(niceBucketSize(1300)).toBe(2000);
  });
});

describe('histogramBuckets', () => {
  it('buckets Google example lengths in tens from zero', () => {
    const b = histogramBuckets([S('Length', LENGTHS)])!;
    expect(b.start).toBe(0);
    expect(b.size).toBe(10);
    expect(b.names).toEqual(['0–10', '10–20', '20–30', '30–40', '40–50']);
    expect(b.counts).toEqual([[16, 4, 3, 4, 1]]);
  });

  it('holds a value from a bucket start up to, not including, its end', () => {
    const b = histogramBuckets([S('a', [0, 1, 2, 3, 4, 5, 6, 7, 8])])!;
    // Nine values: three buckets, size 8/3 rounded up to 5.
    expect(b.size).toBe(5);
    expect(b.counts).toEqual([[5, 4]]);
  });

  it('starts below zero at a multiple of the size, and keeps decimals exact', () => {
    const b = histogramBuckets([S('a', [-0.3, -0.1, 0.1, 0.2, 0.3, 0.45])])!;
    // Six values: three buckets, size 0.75/3, a round 0.25.
    expect(b.size).toBe(0.25);
    expect(b.start).toBe(-0.5);
    expect(b.names).toEqual(['-0.5–-0.25', '-0.25–0', '0–0.25', '0.25–0.5']);
    expect(b.counts).toEqual([[1, 1, 2, 2]]);
  });

  it('shares the buckets across series, counting each its own, a zero count no column', () => {
    const b = histogramBuckets([S('a', [1, 2, 9]), S('b', [9, 9, null, 8])])!;
    // Six values: three buckets, size 8/3 rounded up to 5, from 0.
    expect(b.counts).toEqual([
      [2, 1],
      [null, 3],
    ]);
  });

  it('fills one bucket of size 1 when every value is equal', () => {
    const b = histogramBuckets([S('a', [4.5, 4.5])])!;
    expect(b).toMatchObject({ start: 4, size: 1, names: ['4–5'], counts: [[2]] });
  });

  it('names large edges short', () => {
    const b = histogramBuckets([S('a', [0, 150_000, 390_000])])!;
    expect(b.names[0]).toBe('0–200k');
  });

  it('is null with no value to count', () => {
    expect(histogramBuckets([S('a', [null, null])])).toBeNull();
    expect(histogramBuckets([])).toBeNull();
  });
});

describe('histogramColumns', () => {
  const el = (over: Partial<ShapeElement> = {}): ShapeElement => ({
    ...createShape('line-chart', 0, 0),
    width: 400,
    height: 300,
    chartVariant: 'histogram',
    lineCategories: ['T. rex', 'Raptor', 'Compy'],
    lineSeries: [{ ...S('Length', [12, 2, 1]), color: '#aa3300', axis: 'right', line: true }],
    ...over,
  });

  it('is a column chart of the counts, one series side by side, keeping each series colour', () => {
    const col = histogramColumns(el({ chartStack: 'stacked', chartSmooth: true }));
    expect(col.shape).toBe('bar-chart');
    expect(chartTypeOf(col)).toBe('column');
    expect(isBarGroupChart(col)).toBe(true);
    expect(col.chartStack).toBeUndefined();
    expect(col.lineCategories).toEqual(['0–10', '10–20']);
    expect(col.lineSeries).toEqual([{ name: 'Length', values: [2, 1], color: '#aa3300' }]);
    expect(col.pieSlices).toBeUndefined();
  });

  it('draws the sample series when it has none, and nothing when none is a number', () => {
    const sample = histogramColumns(el({ lineSeries: [] }));
    expect(sample.lineSeries!.map((s) => s.name)).toEqual(LINE_DEFAULT_SERIES.map((s) => s.name));
    const none = histogramColumns(el({ lineSeries: [S('a', [null])] }));
    expect(none.lineCategories).toEqual([]);
    expect(none.lineSeries).toEqual([{ name: 'a', values: [] }]);
  });

  it('leaves a plain column chart of one series drawing its slices', () => {
    expect(isBarGroupChart({ shape: 'bar-chart', lineSeries: [S('a', [1])] })).toBe(false);
  });

  it('renders in the export as columns named by bucket, the series in the legend', () => {
    const svg = renderElementsToSvg(
      { id: 't', name: 'T', elements: [el({ chartValues: true, chartAxis: true })] },
      {},
    );
    expect(svg).toContain('>0–10</text>');
    expect(svg).toContain('>Length</text>');
    expect(svg).toContain('fill="#aa3300"');
    expect(svg).not.toContain('>T. rex</text>');
  });
});
