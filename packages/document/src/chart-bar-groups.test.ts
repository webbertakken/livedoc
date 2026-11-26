// docs/specs/009-elements/pie-chart.md "Several series on a column or bar chart" (D281): each category a group of
// bars side by side, one per series, the category named under (beside) its group.
import { describe, expect, it } from 'vitest';
import {
  BAR_GROUP_SHARE,
  BAR_THICK_MAX,
  barGroupMarks,
  barGroupValueLabels,
  isBarGroupChart,
} from './chart-bar-groups';
import { chartTypeChange } from './chart-types';
import { createShape } from './shape-factory';
import { svgBarChart } from './svg-render-charts';
import type { ShapeElement } from './index';

const AREA = { x: 0, y: 0, w: 400, h: 200 };
const SERIES = [
  { name: 'Cost', values: [15, 3, null] },
  { name: 'Index', values: [60, -4, 40] },
];
const CATS = ['Opus', 'Sonnet', 'Haiku'];

describe('isBarGroupChart', () => {
  it('draws a column or bar chart of two or more series side by side, nothing else', () => {
    expect(isBarGroupChart({ shape: 'bar-chart', lineSeries: SERIES })).toBe(true);
    expect(isBarGroupChart({ shape: 'bar-chart', lineSeries: [SERIES[0]!] })).toBe(false);
    expect(isBarGroupChart({ shape: 'bar-chart' })).toBe(false);
    expect(isBarGroupChart({ shape: 'line-chart', lineSeries: SERIES })).toBe(false);
  });
});

describe('barGroupMarks', () => {
  it('places a column chart’s groups in their slots, each series its bar, a gap none', () => {
    const m = barGroupMarks(AREA, CATS, SERIES, false);
    expect(m.bars).toHaveLength(2);
    expect(m.bars[0]![2]).toBeNull();
    const [a, b] = [m.bars[0]![0]!, m.bars[1]![0]!];
    // Side by side, the first series first, the same thickness, within the group's share of its slot.
    expect(b.x).toBeCloseTo(a.x + a.w);
    expect(a.w).toBeCloseTo(b.w);
    const slot = (m.baseline.x2 - m.baseline.x1) / 3;
    expect(a.w * 2).toBeCloseTo(Math.min(slot * BAR_GROUP_SHARE, BAR_THICK_MAX * 2));
    // The group is centred in its slot.
    expect((a.x + b.x + b.w) / 2).toBeCloseTo(m.baseline.x1 + slot / 2);
    // Up from zero, and below zero hanging under it.
    expect(a.y + a.h).toBeCloseTo(m.baseline.y1);
    const below = m.bars[1]![1]!;
    expect(below.y).toBeCloseTo(m.baseline.y1);
    expect(below.tip.y).toBeGreaterThan(m.baseline.y1);
    expect(m.names.map((n) => [n.text, n.anchor])).toEqual([
      ['Opus', 'middle'],
      ['Sonnet', 'middle'],
      ['Haiku', 'middle'],
    ]);
    expect(m.names[0]!.y).toBeGreaterThan(m.floor);
    expect(m.axis.ticks).toEqual([]);
  });

  it('lays a bar chart’s groups top to bottom, names left of them cut to their column, with an axis', () => {
    const m = barGroupMarks(
      AREA,
      ['A very long model name indeed, longer than its column', 'B'],
      SERIES,
      true,
      10,
      20,
      true,
    );
    const [a, b] = [m.bars[0]![0]!, m.bars[1]![0]!];
    expect(b.y).toBeCloseTo(a.y + a.h);
    expect(a.x).toBeCloseTo(m.baseline.x1);
    expect(m.names[0]!.anchor).toBe('end');
    expect(m.names[0]!.text.endsWith('…')).toBe(true);
    expect(m.names[0]!.x).toBeLessThan(m.floor);
    expect(m.names[1]!.text).toBe('B');
    expect(m.axis.ticks.length).toBeGreaterThan(1);
    expect(m.origin.y).toBeCloseTo((m.baseline.y1 + m.baseline.y2) / 2);
  });

  it('caps a bar’s thickness on a wide chart, and draws nothing but a baseline with no values', () => {
    const wide = barGroupMarks({ x: 0, y: 0, w: 4000, h: 300 }, ['a'], SERIES, false);
    expect(wide.bars[0]![0]!.w).toBe(BAR_THICK_MAX);
    const empty = barGroupMarks(
      AREA,
      ['a'],
      [
        { name: 'x', values: [null] },
        { name: 'y', values: [] },
      ],
      false,
    );
    expect(empty.bars).toEqual([[null], [null]]);
    // No categories still lays out one slot.
    expect(barGroupMarks(AREA, [], SERIES, true).bars).toEqual([[], []]);
  });
});

describe('barGroupValueLabels', () => {
  it('prints each bar’s number past its end, below zero past its foot, none for a gap', () => {
    const cols = barGroupMarks(AREA, CATS, SERIES, false);
    const labels = barGroupValueLabels(cols, SERIES, false, 10);
    expect(labels.map((l) => l.text)).toEqual(['15', '3', '60', '-4', '40']);
    const neg = labels[3]!;
    expect(neg.y).toBeGreaterThan(cols.baseline.y1);
    const bars = barGroupMarks(AREA, CATS, SERIES, true);
    const side = barGroupValueLabels(bars, SERIES, true, 10);
    expect(side.map((l) => l.anchor)).toEqual(['start', 'start', 'start', 'end', 'start']);
  });
});

describe('changing a chart of several series', () => {
  const bar = {
    shape: 'bar-chart',
    pieSlices: [{ label: 'Opus', value: 15 }],
    lineCategories: CATS,
    lineSeries: SERIES,
  };
  it('keeps them between a line and a column chart, a pie its slices alone', () => {
    expect(chartTypeChange(bar, 'line')).toEqual({
      shape: 'line-chart',
      chartVariant: undefined,
      pieSlices: undefined,
    });
    expect(chartTypeChange(bar, 'pie')).toEqual({
      shape: 'pie-chart',
      chartVariant: undefined,
      lineCategories: undefined,
      lineSeries: undefined,
    });
    const line = { shape: 'line-chart', lineCategories: CATS, lineSeries: SERIES };
    expect(chartTypeChange(line, 'column')).toMatchObject({
      shape: 'bar-chart',
      pieSlices: [
        { label: 'Opus', value: 15 },
        { label: 'Sonnet', value: 3 },
        { label: 'Haiku', value: null },
      ],
      linePointNames: undefined,
    });
    expect(chartTypeChange(line, 'column')).not.toHaveProperty('lineSeries');
    expect(chartTypeChange(line, 'pie')).toHaveProperty('lineSeries', undefined);
  });
});

describe('a chart of several series, drawn', () => {
  const groups = (extra: Partial<ShapeElement> = {}) =>
    svgBarChart(
      {
        ...createShape('bar-chart', 0, 0),
        width: 400,
        height: 260,
        lineCategories: CATS,
        lineSeries: [{ ...SERIES[0]!, color: '#aa3300' }, SERIES[1]!],
        ...extra,
      },
      '#000',
    );

  it('draws each series in its colour, names its categories, keys its series, prints its values', () => {
    const svg = groups({ chartValues: true, chartAxis: true });
    // Five bars (a gap draws none) and the key's two swatches.
    expect(svg.match(/<rect /g)).toHaveLength(7);
    expect(svg.match(/fill="#aa3300"/g)!.length).toBeGreaterThanOrEqual(2);
    for (const name of ['Opus', 'Sonnet', 'Haiku', 'Cost', 'Index', '60', '-4'])
      expect(svg).toContain(`>${name}<`);
  });

  it('draws a bar chart of them sideways, and one series as slices as before', () => {
    const svg = groups({ chartVariant: 'horizontal' });
    expect(svg).toContain('text-anchor="end"');
    expect(svg).not.toContain('>60<');
    const one = groups({ lineSeries: [SERIES[0]!] });
    // Its slices, the sample data, one bar each.
    expect(one).not.toContain('>Haiku<');
  });
});
