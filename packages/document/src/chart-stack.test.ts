import { describe, expect, it } from 'vitest';
import { CHART_STACKS, chartStackOf, isChartStack, stackedValues } from './chart-stack';
import type { LineSeries } from './data-shapes';

const s = (values: (number | null)[], name = 'S'): LineSeries => ({ name, values });

describe('isChartStack', () => {
  it('takes the two stackings and nothing else', () => {
    expect(CHART_STACKS).toEqual(['stacked', 'percent']);
    expect(isChartStack('stacked')).toBe(true);
    expect(isChartStack('percent')).toBe(true);
    expect(isChartStack('none')).toBe(false);
    expect(isChartStack(undefined)).toBe(false);
  });
});

describe('chartStackOf (pie-chart.md "Stacking", D282)', () => {
  const two = [s([1]), s([2])];
  it('stacks a column, bar or area chart of two or more series', () => {
    expect(chartStackOf({ shape: 'bar-chart', chartStack: 'stacked', lineSeries: two })).toBe(
      'stacked',
    );
    expect(
      chartStackOf({
        shape: 'bar-chart',
        chartVariant: 'horizontal',
        chartStack: 'percent',
        lineSeries: two,
      }),
    ).toBe('percent');
    expect(
      chartStackOf({
        shape: 'line-chart',
        chartVariant: 'area',
        chartStack: 'percent',
        lineSeries: two,
      }),
    ).toBe('percent');
  });
  it('leaves one series, other types and no stacking unstacked', () => {
    expect(chartStackOf({ shape: 'bar-chart', chartStack: 'stacked', lineSeries: [s([1])] })).toBe(
      null,
    );
    expect(chartStackOf({ shape: 'bar-chart', chartStack: 'stacked' })).toBe(null);
    expect(chartStackOf({ shape: 'line-chart', chartStack: 'stacked', lineSeries: two })).toBe(
      null,
    );
    expect(
      chartStackOf({
        shape: 'line-chart',
        chartVariant: 'scatter',
        chartStack: 'stacked',
        lineSeries: two,
      }),
    ).toBe(null);
    expect(chartStackOf({ shape: 'pie-chart', chartStack: 'stacked', lineSeries: two })).toBe(null);
    expect(chartStackOf({ shape: 'bar-chart', lineSeries: two })).toBe(null);
    expect(
      chartStackOf({
        shape: 'bar-chart',
        chartStack: 'sideways',
        lineSeries: two,
      }),
    ).toBe(null);
  });
});

describe('stackedValues', () => {
  it('stacks each category in series order from zero', () => {
    const r = stackedValues([s([1, 2]), s([3, 4])], 2, 'stacked', true);
    expect(r.starts).toEqual([
      [0, 0],
      [1, 2],
    ]);
    expect(r.ends).toEqual([
      [1, 2],
      [4, 6],
    ]);
  });

  it('keeps a column chart’s values below zero in a stack of their own', () => {
    const r = stackedValues([s([2]), s([-1]), s([3]), s([-2])], 1, 'stacked', true);
    expect(r.starts.map((x) => x[0])).toEqual([0, 0, 2, -1]);
    expect(r.ends.map((x) => x[0])).toEqual([2, -1, 5, -3]);
  });

  it('runs an area’s values as one total', () => {
    const r = stackedValues([s([2]), s([-1]), s([3])], 1, 'stacked', false);
    expect(r.starts.map((x) => x[0])).toEqual([0, 2, 1]);
    expect(r.ends.map((x) => x[0])).toEqual([2, 1, 4]);
  });

  it('reads 100% as each value’s share of its category’s sizes', () => {
    const r = stackedValues([s([1, -1]), s([3, 3])], 2, 'percent', true);
    expect(r.ends).toEqual([
      [25, -25],
      [100, 75],
    ]);
    expect(r.starts).toEqual([
      [0, 0],
      [25, 0],
    ]);
  });

  it('counts no value as zero and marks it null', () => {
    const r = stackedValues([s([1, null]), s([null, 2]), s([2, 2])], 2, 'stacked', true);
    expect(r.ends).toEqual([
      [1, null],
      [null, 2],
      [3, 4],
    ]);
    expect(r.starts).toEqual([
      [0, null],
      [null, 0],
      [1, 2],
    ]);
  });

  it('gives a category of no sizes no share', () => {
    const r = stackedValues([s([0, null]), s([0, null])], 2, 'percent', true);
    expect(r.ends).toEqual([
      [0, null],
      [0, null],
    ]);
  });

  it('reads a series shorter than the categories as no value past its end', () => {
    const r = stackedValues([s([1]), s([1, 1])], 2, 'stacked', false);
    expect(r.ends).toEqual([
      [1, null],
      [2, 1],
    ]);
    expect(r.levels).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });
});
