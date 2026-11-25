// No value is a gap (docs/specs/009-elements/pie-chart.md "Chart types"): a datum with no value draws no mark, no
// value label and takes no part in the value range, on every chart type and in both renderers; a 0 still draws 0.
import { describe, expect, it } from 'vitest';
import { barMarks, lineMarks, pieMarks } from './chart-marks';
import { barValueLabels, lineValueLabels, pieValueLabels } from './chart-values';
import { chartValue } from './data-shapes';
import { chartFieldsFromTable } from './chart-source';
import { chartTypeChange } from './chart-types';
import { svgBarChart, svgLineChart, svgPieChart } from './svg-render-charts';
import { createShape } from './shape-factory';
import { normaliseElement } from './element-normalise';
import { shapeValidationIssue } from './validate-shape';
import type { BoxedElement, ShapeElement } from './index';

const area = { x: 0, y: 0, w: 200, h: 100 };
const cats = ['a', 'b', 'c', 'd', 'e'];

describe('a chart value', () => {
  it('is a finite number, else no value', () => {
    expect(chartValue(0)).toBe(0);
    expect(chartValue(-2.5)).toBe(-2.5);
    for (const none of [null, undefined, '', '3', NaN, Infinity, {}, true])
      expect(chartValue(none)).toBeNull();
  });
});

describe('a line with no value', () => {
  it('breaks the line there, each run its own stretch', () => {
    const m = lineMarks(area, cats, [{ name: 'Y', values: [1, 2, null, 4, 5] }], 'line');
    expect(m.points[0]![2]).toBeNull();
    expect(m.points[0]!.filter(Boolean)).toHaveLength(4);
    // Two stretches, each moved to afresh.
    expect(m.lines[0]!.match(/M /g)).toHaveLength(2);
  });

  it('leaves a value with no neighbour as its point alone', () => {
    const m = lineMarks(area, cats, [{ name: 'Y', values: [1, null, 3, null, 5] }], 'line');
    expect(m.points[0]!.filter(Boolean)).toHaveLength(3);
    expect(m.lines[0]).toBe('');
  });

  it('draws a 0 as 0, joined to its neighbours', () => {
    const m = lineMarks(area, ['a', 'b', 'c'], [{ name: 'Y', values: [1, 0, 2] }], 'line');
    expect(m.points[0]!.every(Boolean)).toBe(true);
    expect(m.lines[0]!.match(/M /g)).toHaveLength(1);
  });

  it('reads anything not a finite number in stored data as no value', () => {
    const stored = [{ name: 'Y', values: [1, 'x', undefined, 4] as unknown as (number | null)[] }];
    const m = lineMarks(area, ['a', 'b', 'c', 'd'], stored, 'line');
    expect(m.points[0]!.map((p) => p !== null)).toEqual([true, false, false, true]);
  });

  it('breaks the area with the line, each run filled down to zero on its own', () => {
    const m = lineMarks(area, cats, [{ name: 'Y', values: [1, 2, null, 4, 5] }], 'area');
    expect(m.areas[0]!.match(/M /g)).toHaveLength(2);
    expect(m.areas[0]!.match(/Z/g)).toHaveLength(2);
  });

  it('keeps no value out of the value range', () => {
    const gap = lineMarks(
      area,
      ['a', 'b'],
      [{ name: 'Y', values: [-5, null] }],
      'line',
      0,
      0,
      true,
    );
    const zero = lineMarks(area, ['a', 'b'], [{ name: 'Y', values: [-5, 0] }], 'line', 0, 0, true);
    expect(gap.axis.left.map((t) => t.text)).toEqual(zero.axis.left.map((t) => t.text));
    const big = lineMarks(
      area,
      ['a', 'b'],
      [{ name: 'Y', values: [null, null] }],
      'line',
      0,
      0,
      true,
    );
    expect(big.axis.left.length).toBeGreaterThan(0);
  });

  it('draws a series with no value at all as nothing', () => {
    const m = lineMarks(area, ['a', 'b'], [{ name: 'Y', values: [null, null] }], 'area');
    expect(m.points[0]).toEqual([null, null]);
    expect(m.lines[0]).toBe('');
    expect(m.areas[0]).toBe('');
  });

  it('prints no value label for no value', () => {
    const series = [{ name: 'Y', values: [1, null, 0] }];
    const m = lineMarks(area, ['a', 'b', 'c'], series, 'line');
    expect(lineValueLabels(m, series).map((l) => l.text)).toEqual(['1', '0']);
  });
});

describe('a scatter with no value', () => {
  // The case that found it: each row holds a number in one series' column only.
  it('draws no point for that series at that x', () => {
    const series = [
      { name: 'A', values: [70, null, null] },
      { name: 'B', values: [null, 80, null] },
      { name: 'C', values: [null, null, 90] },
    ];
    const m = lineMarks(area, ['0.1', '2', '4'], series, 'scatter');
    expect(m.points.flat().filter(Boolean)).toHaveLength(3);
    expect(m.lines.every((l) => l === '')).toBe(true);
  });

  it('leaves out a point whose x is empty, and still reads the other x as numbers', () => {
    const m = lineMarks(area, ['1', '', '10'], [{ name: 'Y', values: [1, 2, 3] }], 'scatter');
    expect(m.points[0]![1]).toBeNull();
    expect(m.labels).toHaveLength(5);
    expect(m.labels[0]!.text).toBe('1');
    expect(m.labels[4]!.text).toBe('10');
  });
});

describe('a column or bar with no value', () => {
  const data = [
    { label: 'A', value: 3 },
    { label: 'B', value: null },
    { label: 'C', value: 0 },
  ];

  it('draws no column in its slot, which stays', () => {
    for (const horizontal of [false, true]) {
      const m = barMarks(area, data, horizontal);
      expect(m.bars).toHaveLength(3);
      expect(m.bars[1]).toBeNull();
      expect(m.bars[2]).not.toBeNull();
    }
  });

  it('keeps no value out of the range', () => {
    const gap = barMarks(
      area,
      [
        { label: 'A', value: 3 },
        { label: 'B', value: null },
      ],
      false,
      0,
      0,
      true,
    );
    const one = barMarks(
      area,
      [
        { label: 'A', value: 3 },
        { label: 'B', value: 0 },
      ],
      false,
      0,
      0,
      true,
    );
    expect(gap.axis.ticks.map((t) => t.text)).toEqual(one.axis.ticks.map((t) => t.text));
  });

  it('prints no value for it, but still names its column', () => {
    const m = barMarks(area, data, false);
    const labels = barValueLabels(m, data, false, 9);
    expect(labels.filter((l) => !l.category).map((l) => l.text)).toEqual(['3', '0']);
    expect(labels.filter((l) => l.category).map((l) => l.text)).toEqual(['A', 'B', 'C']);
  });
});

describe('a pie with no value', () => {
  it('draws no wedge and no label; the others share the whole', () => {
    const data = [
      { label: 'A', value: 1 },
      { label: 'B', value: null },
    ];
    const m = pieMarks(area, data, false);
    expect(m.wedges[0]!.full).toBe(true);
    expect(m.wedges[1]!.d).toBe('');
    expect(pieValueLabels(m, data, 9)).toHaveLength(1);
  });
});

describe('no value in the export', () => {
  const shape = (kind: 'pie-chart' | 'bar-chart' | 'line-chart', extra: Partial<ShapeElement>) =>
    ({
      ...createShape(kind, 0, 0),
      x: 0,
      y: 0,
      width: 260,
      height: 220,
      ...extra,
    }) as BoxedElement & { type: 'shape' };

  it('breaks a line and leaves out the point', () => {
    const svg = svgLineChart(
      shape('line-chart', {
        lineCategories: ['a', 'b', 'c', 'd'],
        lineSeries: [{ name: 'Y', values: [1, 2, null, 4] }],
      }),
      '#000',
    );
    expect(svg.match(/<circle/g)).toHaveLength(3);
    expect(svg).not.toContain('NaN');
  });

  it('draws a scatter’s points only where there are values', () => {
    const svg = svgLineChart(
      shape('line-chart', {
        chartVariant: 'scatter',
        lineCategories: ['1', '2', '3'],
        lineSeries: [
          { name: 'A', values: [5, null, null] },
          { name: 'B', values: [null, 6, null] },
        ],
      }),
      '#000',
    );
    expect(svg.match(/<circle/g)).toHaveLength(2);
  });

  it('draws no column and no wedge', () => {
    const pieSlices = [
      { label: 'A', value: 2 },
      { label: 'B', value: null },
      { label: 'C', value: 1 },
    ];
    // The key off, so every rect is a column.
    const columns = (slices: typeof pieSlices) =>
      svgBarChart(
        shape('bar-chart', { pieSlices: slices, chartValues: true, chartLegend: false }),
        '#000',
      );
    expect(columns(pieSlices)).not.toContain('NaN');
    expect(columns(pieSlices).match(/<rect/g)).toHaveLength(2);
    expect(columns([pieSlices[0]!, { label: 'B', value: 0 }]).match(/<rect/g)).toHaveLength(2);
    const pie = svgPieChart(shape('pie-chart', { pieSlices }), '#000');
    expect(pie).not.toContain('NaN');
  });
});

describe('no value carried', () => {
  it('stays no value when a sheet’s table becomes a chart’s fields', () => {
    const t = {
      categories: ['Jan', 'Feb'],
      series: [{ name: 'Sales', values: [null, -2] }],
    };
    expect(chartFieldsFromTable({ shape: 'line-chart' }, t)).toMatchObject({
      lineSeries: [{ values: [null, -2] }],
    });
    expect(chartFieldsFromTable({ shape: 'bar-chart' }, t)).toEqual({
      pieSlices: [
        { label: 'Jan', value: null },
        { label: 'Feb', value: -2 },
      ],
    });
    expect(chartFieldsFromTable({ shape: 'pie-chart' }, t)).toEqual({
      pieSlices: [
        { label: 'Jan', value: null },
        { label: 'Feb', value: 0 },
      ],
    });
  });

  it('gives a scatter’s empty x cell an empty category', () => {
    const t = {
      categories: ['1', '2'],
      series: [
        { name: 'X', values: [5, null] },
        { name: 'Y', values: [1, 2] },
      ],
    };
    expect(chartFieldsFromTable({ shape: 'line-chart', chartVariant: 'scatter' }, t)).toMatchObject(
      {
        lineCategories: ['5', ''],
      },
    );
  });

  it('stays no value across a change of type', () => {
    const line = {
      ...createShape('line-chart', 0, 0),
      lineCategories: ['a', 'b'],
      lineSeries: [{ name: 'S', values: [null, 3] }],
    } as ShapeElement;
    expect(chartTypeChange(line, 'pie')!.pieSlices).toEqual([
      { label: 'a', value: null },
      { label: 'b', value: 3 },
    ]);
    const bar = {
      ...createShape('bar-chart', 0, 0),
      pieSlices: [
        { label: 'a', value: null },
        { label: 'b', value: -1 },
      ],
    } as ShapeElement;
    expect(chartTypeChange(bar, 'line')!.lineSeries).toEqual([
      { name: 'Series 1', values: [null, -1] },
    ]);
    expect(chartTypeChange(bar, 'pie')!.pieSlices).toEqual([
      { label: 'a', value: null },
      { label: 'b', value: 0 },
    ]);
  });

  it('keeps stored data with no value valid', () => {
    const chart = createShape('line-chart', 0, 0);
    expect(
      shapeValidationIssue({
        ...chart,
        lineCategories: ['a', 'b'],
        lineSeries: [{ name: 'S', values: [null, 1] }],
      }),
    ).toBeNull();
    expect(
      shapeValidationIssue({
        ...createShape('bar-chart', 0, 0),
        pieSlices: [{ label: 'a', value: null }],
      }),
    ).toBeNull();
  });

  it('tidies an agent’s write: text that reads as a number is it, anything else no value', () => {
    const out = normaliseElement({
      ...createShape('line-chart', 0, 0),
      lineCategories: ['a', 'b', 'c', 'd'],
      lineSeries: [{ name: 'S', values: ['3', '', 'x'] }],
      id: 'c1',
    }) as ShapeElement;
    expect(out.lineSeries).toEqual([{ name: 'S', values: [3, null, null, null] }]);
    const pie = normaliseElement({
      ...createShape('bar-chart', 0, 0),
      pieSlices: [
        { label: 'a', value: null },
        { label: 'b', value: '' },
        { label: 'c', value: 0 },
      ],
      id: 'c2',
    }) as ShapeElement;
    expect(pie.pieSlices!.map((s) => s.value)).toEqual([null, null, 0]);
  });
});

// pie-chart.md "Scatter's value range": a scatter's value axis fits its values, so points far from zero are not
// squeezed against the top over an empty band; zero is in it only when the values cross it.
describe('a scatter’s value range', () => {
  const runa = [
    { name: 'A', values: [70.8, null, 64.1] },
    { name: 'B', values: [null, 94.2, null] },
  ];

  it('fits its values with Show Axis, no zero tick under them', () => {
    const m = lineMarks(area, ['0.1', '2', '4'], runa, 'scatter', 0, 0, true);
    expect(m.axis.left.map((t) => t.text)).toEqual(['60', '70', '80', '90', '100']);
  });

  it('spreads its points over the plot without Show Axis', () => {
    const m = lineMarks(area, ['0.1', '2', '4'], runa, 'scatter');
    const ys = m.points.flat().flatMap((p) => (p ? [p.y] : []));
    const lowest = Math.max(...ys);
    const highest = Math.min(...ys);
    // The least and greatest values span most of the plot's height.
    expect(lowest - highest).toBeGreaterThan(m.plot.h * 0.5);
  });

  it('holds zero when its values cross it', () => {
    const m = lineMarks(area, ['1', '2'], [{ name: 'Y', values: [-3, 8] }], 'scatter', 0, 0, true);
    expect(m.axis.left.map((t) => t.text)).toContain('0');
  });

  it('widens all-equal values around them', () => {
    const m = lineMarks(area, ['1', '2'], [{ name: 'Y', values: [70, 70] }], 'scatter', 0, 0, true);
    const texts = m.axis.left.map((t) => t.text);
    expect(texts).toContain('70');
    expect(texts).not.toContain('0');
  });

  it('keeps zero on a line or area chart', () => {
    for (const variant of ['line', 'area'] as const)
      expect(lineMarks(area, ['a', 'b'], runa, variant, 0, 0, true).axis.left[0]!.text).toBe('0');
  });
});
