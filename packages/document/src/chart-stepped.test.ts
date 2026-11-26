// docs/specs/009-elements/pie-chart.md "Chart types", "Stepped Area" (D289): each value a flat step across its slot,
// risers on the shared edges, filled to zero; stacked as Stacked Area; a Combo chart's stepped area series likewise.
import { describe, expect, it } from 'vitest';
import {
  comboKeyItems,
  comboMarks,
  comboSeriesTypes,
  COMBO_SERIES_TYPE_LABELS,
} from './chart-combo';
import { lineMarks } from './chart-marks';
import { pointsMarked, stepAreaPath, stepBandPath, stepPath } from './chart-stepped';
import { chartShapeOf, chartTypeChange, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { createShape } from './shape-factory';
import { svgLineChart } from './svg-render-charts';

const AREA = { x: 0, y: 0, w: 400, h: 200 };
const CATS = ['Q1', 'Q2', 'Q3', 'Q4'];
const S = (
  name: string,
  values: (number | null)[],
  more: Partial<LineSeries> = {},
): LineSeries => ({
  name,
  values,
  ...more,
});

describe('step paths', () => {
  const run = [
    { x: 10, y: 50 },
    { x: 30, y: 20 },
    { x: 50, y: 40 },
  ];

  it('runs flat across each slot, rising or falling on the shared edge', () => {
    expect(stepPath(run, 10)).toBe('M 0 50 H 20 V 20 H 40 V 40 H 60');
  });

  it('draws a point alone as a step alone, and nothing for no points', () => {
    expect(stepPath([{ x: 10, y: 5 }], 10)).toBe('M 0 5 H 20');
    expect(stepPath([], 10)).toBe('');
  });

  it('closes a run down to zero', () => {
    expect(stepAreaPath(run, 10, 100)).toBe('M 0 100 V 50 H 20 V 20 H 40 V 40 H 60 V 100 Z');
    expect(stepAreaPath([], 10, 100)).toBe('');
  });

  it('bands a stacked series flat across each slot, along its tops and back along the total under it', () => {
    expect(stepBandPath([10, 30], [5, 8], [20, 30], 10)).toBe(
      'M 0 5 L 20 5 L 20 8 L 40 8 L 40 30 L 20 30 L 20 20 L 0 20 Z',
    );
    expect(stepBandPath([], [], [], 10)).toBe('');
  });

  it('marks a line or area series’ points, never a step’s', () => {
    expect(pointsMarked({ dot: 3 }, 0)).toBe(true);
    expect(pointsMarked({ dot: 0 }, 0)).toBe(false);
    expect(pointsMarked({ dot: 3, types: ['column', 'stepped-area'] }, 1)).toBe(false);
    expect(pointsMarked({ dot: 3, types: ['column', 'stepped-area'] }, 0)).toBe(true);
  });
});

describe('stepped area as a chart type', () => {
  it('is a line chart kind with its own variant, named Stepped Area', () => {
    expect(chartShapeOf('stepped-area')).toEqual({
      shape: 'line-chart',
      chartVariant: 'stepped-area',
    });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'stepped-area' })).toBe('stepped-area');
    expect(CHART_TYPE_LABELS['stepped-area']).toBe('Stepped Area');
    expect(chartTypeChange({ shape: 'line-chart', chartVariant: 'area' }, 'stepped-area')).toEqual({
      shape: 'line-chart',
      chartVariant: 'stepped-area',
    });
  });
});

describe('lineMarks stepped area', () => {
  const m = lineMarks(AREA, CATS, [S('A', [1, 2, null, 3])], 'stepped-area');
  const { x, w } = m.plot;
  const half = w / 8;

  it('puts each category in a slot, its label and point at the slot’s middle', () => {
    expect(m.labels.map((l) => l.x)).toEqual([0, 1, 2, 3].map((i) => x + half * (2 * i + 1)));
    expect(m.points[0]![0]!.x).toBeCloseTo(x + half);
    expect(m.points[0]![2]).toBeNull();
  });

  it('draws steps with no markers, broken at a gap, a value alone still a step', () => {
    expect(m.dot).toBe(0);
    const stretches = m.lines[0]!.split('M ').filter(Boolean);
    expect(stretches).toHaveLength(2);
    expect(stretches[0]).toMatch(/^\S+ \S+ H \S+ V \S+ H \S+ $/);
    expect(stretches[1]).toMatch(/^\S+ \S+ H \S+$/);
  });

  it('fills each run of steps down to zero', () => {
    const shapes = m.areas[0]!.split('M ').filter(Boolean);
    expect(shapes).toHaveLength(2);
    for (const shape of shapes) expect(shape.trim().endsWith('Z')).toBe(true);
  });

  it('stacks as Stacked Area, each band flat across its slots', () => {
    const stacked = lineMarks(
      AREA,
      ['A', 'B'],
      [S('one', [1, 2]), S('two', [3, null])],
      'stepped-area',
      0,
      0,
      false,
      'stacked',
    );
    // The second series' points sit at the running totals; no value draws none.
    expect(stacked.points[1]![0]!.y).toBeLessThan(stacked.points[0]![0]!.y);
    expect(stacked.points[1]![1]).toBeNull();
    const band = stacked.areas[1]!;
    expect(band.startsWith('M ')).toBe(true);
    expect(band.split(' L ')).toHaveLength(8);
  });

  it('puts a series on the right axis on its own scale, unstacked', () => {
    const right = lineMarks(
      AREA,
      CATS,
      [S('A', [1, 2, 3, 4]), S('B', [100, 200, 300, 400], { axis: 'right' })],
      'stepped-area',
      0,
      0,
      true,
    );
    expect(right.axis.right.length).toBeGreaterThan(0);
    expect(right.points[1]![3]!.y).toBeCloseTo(right.points[0]![3]!.y, 0);
  });
});

describe('a Combo chart’s stepped area series', () => {
  const series = [S('Cost', [4, 5, 6, 7]), S('Index', [1, null, 3, 2], { type: 'stepped-area' })];
  const m = comboMarks(AREA, CATS, series);

  it('is a series type named Stepped Area, never a default', () => {
    expect(COMBO_SERIES_TYPE_LABELS['stepped-area']).toBe('Stepped Area');
    expect(comboSeriesTypes(series)).toEqual(['column', 'stepped-area']);
    expect(comboKeyItems(series)[1]).toEqual({ label: 'Index' });
  });

  it('draws steps across the slots, filled to zero, broken at a gap', () => {
    const slot = m.plot.w / 4;
    expect(m.lines[1]!.startsWith(`M ${Math.round(m.plot.x * 100) / 100} `)).toBe(true);
    expect(m.lines[1]!.split('M ').filter(Boolean)).toHaveLength(2);
    expect(m.areas[1]!.split('Z').filter((p) => p.trim())).toHaveLength(2);
    expect(m.points[1]![0]!.x).toBeCloseTo(m.plot.x + slot / 2);
    expect(m.bars[1]).toEqual([]);
  });
});

describe('svgLineChart stepped area', () => {
  const chart = (more: Partial<ShapeElement>): ShapeElement => ({
    ...createShape('line-chart', 0, 0),
    width: 400,
    height: 240,
    lineCategories: CATS,
    ...more,
  });

  it('draws its steps and fills, and no point markers', () => {
    const svg = svgLineChart(
      chart({ chartVariant: 'stepped-area', lineSeries: [S('A', [1, 2, 3, 4])] }),
      '#000',
    );
    expect(svg).toContain('fill-opacity="0.25"');
    expect(svg).toContain(' V ');
    expect(svg).not.toContain('<circle');
  });

  it('marks a Combo chart’s line points but not its steps', () => {
    const svg = svgLineChart(
      chart({
        chartVariant: 'combo',
        lineSeries: [
          S('A', [1, 2, 3, 4], { type: 'stepped-area' }),
          S('B', [2, 3, 4, 5], { type: 'line' }),
        ],
      }),
      '#000',
    );
    // The line series' four points, and the dot of its key's line.
    expect(svg.split('<circle')).toHaveLength(6);
  });
});
