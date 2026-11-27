// docs/specs/009-elements/pie-chart.md "Chart types", "Waterfall" (D326): the first series as changes to a running
// total, each a floating column, rises and falls apart, a Subtotal column last, connectors between, a gap runs on.
import { describe, expect, it } from 'vitest';
import { barSpanMarks } from './chart-bar-groups';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import {
  isWaterfallChart,
  WATERFALL_FALL_COLOR,
  WATERFALL_TOTAL_COLOR,
  waterfallKeys,
  waterfallMarks,
  waterfallReadout,
  waterfallSteps,
} from './chart-waterfall';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { renderElementsToSvg } from './index';
import { createShape } from './shape-factory';

const AREA = { x: 0, y: 0, w: 400, h: 200 };
const S = (name: string, values: (number | null)[]): LineSeries => ({ name, values });
// Google Sheets' help example: annual revenue changes.
const YEARS = ['2013', '2014', '2015', '2016', '2017', '2018'];
const REVENUE = S('Revenue', [11690, -2350, 15467, -2000, 19560, -5970]);

describe('waterfall as a chart type', () => {
  it('is a line chart kind with its own variant, named Waterfall', () => {
    expect(chartShapeOf('waterfall')).toEqual({ shape: 'line-chart', chartVariant: 'waterfall' });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'waterfall' })).toBe('waterfall');
    expect(isWaterfallChart({ shape: 'line-chart', chartVariant: 'waterfall' })).toBe(true);
    expect(isWaterfallChart({ shape: 'line-chart' })).toBe(false);
    expect(CHART_TYPE_LABELS.waterfall).toBe('Waterfall');
  });
});

describe('waterfallSteps', () => {
  it('runs a total through the first series, then the subtotal from zero', () => {
    const steps = waterfallSteps([REVENUE, S('Other', [1, 2, 3, 4, 5, 6])], 6);
    expect(steps[0]).toEqual({ kind: 'rise', from: 0, to: 11690, value: 11690 });
    expect(steps[1]).toEqual({ kind: 'fall', from: 11690, to: 9340, value: -2350 });
    expect(steps[6]).toEqual({ kind: 'total', from: 0, to: 36397, value: 36397 });
  });

  it('carries the total over a gap, and has no subtotal without a value', () => {
    const steps = waterfallSteps([S('a', [5, null, -2])], 3);
    expect(steps[1]).toBeNull();
    expect(steps[2]).toMatchObject({ from: 5, to: 3 });
    expect(waterfallSteps([S('a', [null])], 1)).toEqual([null, null]);
    expect(waterfallSteps([], 1)).toEqual([null, null]);
  });
});

describe('waterfallMarks', () => {
  it('floats each column between its totals, one to a slot, the subtotal last and grey', () => {
    const m = waterfallMarks(AREA, YEARS, [REVENUE]);
    expect(m.categories.at(-1)).toBe('Subtotal');
    const [rises, falls, totals] = m.bars;
    expect(rises![1]).toBeNull();
    const fall = falls![1]!;
    const first = rises![0]!;
    // The fall hangs from the first column's top.
    expect(fall.y).toBeCloseTo(first.y);
    expect(fall.x).toBeGreaterThan(first.x + first.w);
    expect(totals![6]!.y + totals![6]!.h).toBeCloseTo(m.baseline.y1);
    expect(m.rows[2]!.values[6]).toBe(36397);
    expect(m.names.map((n) => n.text).at(-1)).toBe('Subtotal');
  });

  it('connects each column’s end to the next drawn column, over a gap', () => {
    const m = waterfallMarks(AREA, ['a', 'b', 'c'], [S('s', [5, null, -2])], 10, 20, true);
    expect(m.connectors).toHaveLength(2);
    const [a, c] = [m.bars[0]![0]!, m.bars[1]![2]!];
    expect(m.connectors[0]).toEqual({ x1: a.x + a.w, x2: c.x, y: a.y });
    expect(m.axis.ticks.length).toBeGreaterThan(0);
  });

  it('keys rises in the series’ colour, falls red, the subtotal grey', () => {
    expect(waterfallKeys([{ ...REVENUE, color: '#123456' }])).toEqual([
      { label: 'Increase', color: '#123456' },
      { label: 'Decrease', color: WATERFALL_FALL_COLOR },
      { label: 'Subtotal', color: WATERFALL_TOTAL_COLOR },
    ]);
    expect(waterfallKeys([])[0]).toEqual({ label: 'Increase' });
  });

  it('reads a column as its change, the subtotal as the total', () => {
    const m = waterfallMarks(AREA, ['', ...YEARS.slice(1)], [REVENUE]);
    expect(waterfallReadout(m, [REVENUE], 0)).toBe('— · Revenue: 11.7k');
    expect(waterfallReadout(m, [REVENUE], 1)).toBe('2014 · Revenue: -2,350');
    expect(waterfallReadout(m, [REVENUE], 6)).toBe('Subtotal: 36.4k');
    expect(waterfallReadout(m, [], 6)).toBe('Subtotal: 36.4k');
    const bare = waterfallMarks(AREA, ['x'], [S('s', [1])]);
    expect(waterfallReadout(bare, [], 0)).toBe('x · : 1');
  });

  it('spans bars of the column layout, side by side unless one to a slot', () => {
    const two = barSpanMarks(AREA, ['a'], [[[0, 1]], [[0, 2]]], { horizontal: false });
    expect(two.bars[1]![0]!.x).toBeGreaterThan(two.bars[0]![0]!.x);
    expect(two.bars[0]![0]!.rx).toBeGreaterThan(0);
  });
});

describe('the waterfall in the export', () => {
  const el = (over: Partial<ShapeElement> = {}): ShapeElement => ({
    ...createShape('line-chart', 0, 0),
    width: 400,
    height: 300,
    chartVariant: 'waterfall',
    chartAxis: true,
    chartValues: true,
    lineCategories: YEARS,
    lineSeries: [{ ...REVENUE, color: '#aa3300' }],
    ...over,
  });

  it('draws columns, connectors, names, values and the three keys', () => {
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el()] }, {});
    expect(svg.split('fill="#aa3300"').length).toBe(5);
    expect(svg).toContain('stroke="#94a3b8"');
    for (const t of ['>2014</text>', '>Subtotal</text>', '>Decrease</text>', '>-2,350</text>'])
      expect(svg).toContain(t);
    expect(svg).toContain('36.4k');
  });

  it('draws the sample data when it has none', () => {
    const svg = renderElementsToSvg(
      {
        id: 't',
        name: 'T',
        elements: [el({ lineCategories: [], lineSeries: [], chartValues: false })],
      },
      {},
    );
    expect(svg).toContain('>Subtotal</text>');
  });
});
