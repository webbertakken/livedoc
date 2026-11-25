// A scatter series drawn as a line (docs/specs/009-elements/pie-chart.md "A scatter series drawn as a line"): its
// present points joined in order of x, markers kept; the other series stay points.
import { describe, expect, it } from 'vitest';
import { lineMarks } from './chart-marks';
import { chartFieldsFromTable } from './chart-source';
import { svgLineChart } from './svg-render-charts';
import { createShape } from './shape-factory';
import { normaliseElement } from './element-normalise';
import { shapeValidationIssue } from './validate-shape';
import type { BoxedElement, LineSeries, ShapeElement } from './index';

const area = { x: 0, y: 0, w: 200, h: 100 };
// The x of each vertex of a path, in order.
const xsOf = (d: string) => [...d.matchAll(/[ML] ([-\d.]+) /g)].map((m) => Number(m[1]));

describe('a scatter series drawn as a line', () => {
  it('joins its points in order of x, and leaves the others as points', () => {
    const series: LineSeries[] = [
      { name: 'Frontier', values: [3, 1, 2], line: true },
      { name: 'Models', values: [5, 6, 7] },
    ];
    const m = lineMarks(area, ['4', '1', '2'], series, 'scatter');
    const xs = xsOf(m.lines[0]!);
    expect(xs).toHaveLength(3);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(m.lines[0]!.match(/M /g)).toHaveLength(1);
    expect(m.lines[1]).toBe('');
    // Markers kept.
    expect(m.points[0]!.every(Boolean)).toBe(true);
  });

  it('joins only its present points, one unbroken line through mostly empty values', () => {
    const series: LineSeries[] = [
      { name: 'Pareto', values: [1, null, null, 4, null, 2], line: true },
    ];
    const m = lineMarks(area, ['1', '2', '3', '4', '5', '6'], series, 'scatter');
    expect(m.lines[0]!.match(/M /g)).toHaveLength(1);
    expect(xsOf(m.lines[0]!)).toHaveLength(3);
  });

  it('keeps rows’ order for equal x, and category order without numeric x', () => {
    const eq = lineMarks(area, ['1', '1'], [{ name: 'S', values: [1, 9], line: true }], 'scatter');
    expect(eq.lines[0]).toBe(
      `M ${eq.points[0]![0]!.x} ${eq.points[0]![0]!.y} L ${eq.points[0]![1]!.x} ${eq.points[0]![1]!.y}`,
    );
    const text = lineMarks(
      area,
      ['b', 'a', 'c'],
      [{ name: 'S', values: [1, 2, 3], line: true }],
      'scatter',
    );
    const xs = xsOf(text.lines[0]!);
    expect(xs).toEqual(text.points[0]!.map((p) => p!.x));
  });

  it('draws no line for a series with fewer than two points', () => {
    const m = lineMarks(
      area,
      ['1', '2'],
      [{ name: 'S', values: [1, null], line: true }],
      'scatter',
    );
    expect(m.lines[0]).toBe('');
  });

  it('changes nothing on a line or area chart', () => {
    for (const variant of ['line', 'area'] as const) {
      const plain = lineMarks(area, ['a', 'b'], [{ name: 'S', values: [1, 2] }], variant);
      const marked = lineMarks(
        area,
        ['a', 'b'],
        [{ name: 'S', values: [1, 2], line: true }],
        variant,
      );
      expect(marked).toEqual(plain);
    }
  });
});

describe('a scatter series drawn as a line in the export', () => {
  const chart = (series: LineSeries[]) =>
    ({
      ...createShape('line-chart', 0, 0),
      x: 0,
      y: 0,
      width: 300,
      height: 220,
      chartVariant: 'scatter',
      lineCategories: ['1', '2', '3'],
      lineSeries: series,
    }) as BoxedElement & { type: 'shape' };

  it('draws the line under its points, and a line key for it in the legend', () => {
    const svg = svgLineChart(
      chart([
        { name: 'Pareto', values: [1, null, 3], line: true },
        { name: 'Models', values: [2, 2, 2] },
      ]),
      '#000',
    );
    expect(svg.match(/stroke-linejoin/g)).toHaveLength(1);
    // The key: one line swatch (the Pareto series), one square (Models).
    expect(svg.match(/<line /g)).toHaveLength(1);
    expect(svg.match(/<rect /g)).toHaveLength(1);
  });

  it('draws points only without the mark, as before', () => {
    const svg = svgLineChart(chart([{ name: 'Models', values: [2, 2, 2] }]), '#000');
    expect(svg).not.toContain('stroke-linejoin');
    expect(svg).not.toContain('<line ');
  });
});

describe('the line mark kept', () => {
  it('survives a sheet’s re-read by position, with the colour and the right axis', () => {
    const el = {
      shape: 'line-chart',
      chartVariant: 'scatter',
      lineSeries: [
        { name: 'A', values: [0], color: '#ff0000', axis: 'right' as const },
        { name: 'B', values: [0], line: true as const },
      ],
    };
    const t = {
      categories: ['Jan'],
      series: [
        { name: 'A', values: [1] },
        { name: 'B', values: [2] },
      ],
    };
    expect(chartFieldsFromTable(el, t)).toMatchObject({
      lineSeries: [
        { name: 'A', values: [1], color: '#ff0000', axis: 'right' },
        { name: 'B', values: [2], line: true },
      ],
    });
  });

  it('is valid stored, kept as true by an agent’s write, any other value dropped', () => {
    const base = { ...createShape('line-chart', 0, 0), lineCategories: ['1', '2'] };
    expect(
      shapeValidationIssue({ ...base, lineSeries: [{ name: 'S', values: [1, 2], line: true }] }),
    ).toBeNull();
    const out = normaliseElement({
      ...base,
      id: 'c',
      lineSeries: [
        { name: 'S', values: [1, 2], line: true },
        { name: 'T', values: [1, 2], line: 'yes' },
      ],
    }) as ShapeElement;
    expect(out.lineSeries).toEqual([
      { name: 'S', values: [1, 2], line: true },
      { name: 'T', values: [1, 2] },
    ]);
  });
});
