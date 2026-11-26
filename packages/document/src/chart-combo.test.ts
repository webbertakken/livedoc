// docs/specs/009-elements/pie-chart.md "Chart types", "Combo" (D286): each series drawn as its own series type over one
// row of category slots, columns clustered, points at the slots' middles.
import { describe, expect, it } from 'vitest';
import {
  comboKeyItems,
  comboMarkAt,
  comboMarks,
  comboSeriesTypes,
  comboValueLabels,
  isComboChart,
  isComboSeriesType,
} from './chart-combo';
import { chartShapeOf, chartTypeChange, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { normaliseElement } from './element-normalise';
import { createShape } from './shape-factory';
import { svgLineChart } from './svg-render-charts';
import { lineFieldsFromTable } from './chart-source';

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

describe('combo as a chart type', () => {
  it('is a line chart kind with its own variant, named Combo', () => {
    expect(chartShapeOf('combo')).toEqual({ shape: 'line-chart', chartVariant: 'combo' });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'combo' })).toBe('combo');
    expect(isComboChart({ shape: 'line-chart', chartVariant: 'combo' })).toBe(true);
    expect(isComboChart({ shape: 'line-chart' })).toBe(false);
    expect(isComboChart({ shape: 'bar-chart', chartVariant: 'combo' })).toBe(false);
    expect(CHART_TYPE_LABELS.combo).toBe('Combo');
  });

  it('keeps several series from a column chart, and a series type, across type changes', () => {
    const bar = {
      shape: 'bar-chart',
      lineCategories: CATS,
      lineSeries: [S('A', [1, 2, 3, 4], { type: 'line' }), S('B', [1, 2, 3, 4])],
    };
    const patch = chartTypeChange(bar, 'combo')!;
    expect(patch).toMatchObject({ shape: 'line-chart', chartVariant: 'combo' });
    expect(patch.lineSeries).toBeUndefined();
    expect(chartTypeChange({ shape: 'line-chart', chartVariant: 'combo' }, 'line')).toEqual({
      shape: 'line-chart',
      chartVariant: undefined,
    });
  });
});

describe('comboSeriesTypes', () => {
  it('makes the first half, rounded up, columns and the rest lines', () => {
    expect(comboSeriesTypes([S('a', [])])).toEqual(['column']);
    expect(comboSeriesTypes([S('a', []), S('b', [])])).toEqual(['column', 'line']);
    expect(comboSeriesTypes([S('a', []), S('b', []), S('c', [])])).toEqual([
      'column',
      'column',
      'line',
    ]);
    expect(comboSeriesTypes([])).toEqual([]);
  });

  it('takes a series its own type, and reads any other value as none', () => {
    expect(
      comboSeriesTypes([
        S('a', [], { type: 'area' }),
        { name: 'b', values: [], type: 'steppedArea' } as unknown as LineSeries,
      ]),
    ).toEqual(['area', 'line']);
    expect(isComboSeriesType('column')).toBe(true);
    expect(isComboSeriesType('bar')).toBe(false);
  });
});

describe('comboMarks', () => {
  const series = [S('Revenue', [10, 20, null, 40]), S('Margin', [5, null, 15, 20])];

  it('clusters the column series in each slot and puts points at the slots’ middles', () => {
    const three = [S('A', [10, 20, 30, 40]), S('B', [5, 5, 5, 5]), S('C', [1, 2, 3, 4])];
    const m = comboMarks(AREA, CATS, three);
    expect(m.types).toEqual(['column', 'column', 'line']);
    const slot = m.plot.w / 4;
    const a0 = m.bars[0]![0]!;
    const b0 = m.bars[1]![0]!;
    // Side by side, an equal part each, the pair centred in its slot.
    expect(b0.x).toBeCloseTo(a0.x + a0.w);
    expect((a0.x + b0.x + b0.w) / 2).toBeCloseTo(m.plot.x + slot / 2);
    expect(a0.w).toBeCloseTo((slot * 0.8) / 2);
    expect(m.bars[2]).toEqual([]);
    expect(m.points[0]!.every((p) => p === null)).toBe(true);
    expect(m.points[2]![1]!.x).toBeCloseTo(m.plot.x + slot * 1.5);
    expect(m.labels.map((l) => l.x)).toEqual(m.points[2]!.map((p) => p!.x));
    expect(m.lines[0]).toBe('');
    expect(m.lines[2]).toMatch(/^M /);
  });

  it('caps a column at 48 px and grows it from zero on one axis with the lines', () => {
    const m = comboMarks({ x: 0, y: 0, w: 2000, h: 200 }, ['a'], [S('A', [10]), S('B', [-10])]);
    const col = m.bars[0]![0]!;
    expect(col.w).toBe(48);
    const p = m.points[1]![0]!;
    // Zero sits half way: 10 above it, the line's -10 as far below.
    const zero = col.y + col.h;
    expect(p.y - zero).toBeCloseTo(zero - col.y);
    expect(col.rx).toBe(3);
  });

  it('hangs a column below zero from it', () => {
    const m = comboMarks(AREA, ['a', 'b'], [S('A', [-5, 5]), S('B', [1, 1])]);
    const below = m.bars[0]![0]!;
    const above = m.bars[0]![1]!;
    expect(below.y).toBeCloseTo(above.y + above.h);
    expect(below.tip.y).toBeGreaterThan(below.y);
  });

  it('leaves a gap: no column, a broken line', () => {
    const m = comboMarks(AREA, CATS, series);
    expect(m.bars[0]![2]).toBeNull();
    expect(m.points[1]![1]).toBeNull();
    // The line's run after the gap is two points, the one before it a point alone.
    expect(m.lines[1]!.match(/M /g)).toHaveLength(1);
  });

  it('fills an area series to zero, a shape per run', () => {
    const m = comboMarks(AREA, CATS, [
      S('A', [1, 2, 3, 4]),
      S('B', [2, 3, null, 1], { type: 'area' }),
    ]);
    expect(m.areas[0]).toBe('');
    expect(m.areas[1]!.match(/M /g)).toHaveLength(1);
    expect(m.areas[1]).toMatch(/Z$/);
    expect(m.lines[1]).toMatch(/^M /);
  });

  it('curves a line series with Smooth, never an area', () => {
    const three = [S('A', [1, 2, 3, 4], { type: 'line' }), S('B', [1, 3, 2, 4], { type: 'area' })];
    const m = comboMarks(AREA, CATS, three, 0, 0, false, true);
    expect(m.lines[0]).toContain('C ');
    expect(m.lines[1]).not.toContain('C ');
  });

  it('draws a series on the right axis on its own scale, columns too', () => {
    const m = comboMarks(
      AREA,
      ['a', 'b'],
      [S('Visitors', [1000, 2000]), S('Rate', [2, 4], { axis: 'right' })],
      0,
      0,
      true,
    );
    expect(m.axis.left.length).toBeGreaterThan(0);
    expect(m.axis.right.map((t) => t.text)).toContain('4');
    // The rate's top reaches as high as the visitors' top, each on its own scale.
    expect(m.points[1]![1]!.y).toBeCloseTo(m.bars[0]![1]!.y);
    const onRight = comboMarks(AREA, ['a'], [S('A', [1], { axis: 'right' }), S('B', [2])]);
    expect(onRight.bars[0]![0]!.h).toBeGreaterThan(0);
    // Every series on the right is one axis.
    const all = comboMarks(AREA, ['a'], [S('A', [1], { axis: 'right' })], 0, 0, true);
    expect(all.axis.right).toEqual([]);
  });

  it('shifts every point by the offset, and draws an empty chart', () => {
    const at = comboMarks(AREA, CATS, series);
    const moved = comboMarks(AREA, CATS, series, 10, 20);
    expect(moved.bars[0]![0]!.x).toBeCloseTo(at.bars[0]![0]!.x + 10);
    expect(moved.points[1]![0]!.y).toBeCloseTo(at.points[1]![0]!.y + 20);
    const none = comboMarks(AREA, [], []);
    expect(none.bars).toEqual([]);
    expect(none.labels).toEqual([]);
    const flat = comboMarks(AREA, ['a'], [S('A', [0])]);
    expect(flat.bars[0]![0]!.h).toBe(0);
  });
});

describe('comboValueLabels, comboKeyItems and comboMarkAt', () => {
  const series = [S('A', [10, -5, null]), S('B', [3, null, 4])];
  const m = comboMarks(AREA, ['a', 'b', 'c'], series);

  it('prints a column’s number past its end and a point’s over it', () => {
    const labels = comboValueLabels(m, series, 10);
    expect(labels.map((l) => l.text)).toEqual(['10', '-5', '3', '4']);
    expect(labels[0]!.y).toBeLessThan(m.bars[0]![0]!.tip.y);
    expect(labels[1]!.y).toBeGreaterThan(m.bars[0]![1]!.tip.y);
    expect(labels[2]!.y).toBeLessThan(m.points[1]![0]!.y);
  });

  it('keys a line by a line, a column or area by a square', () => {
    expect(
      comboKeyItems([S('A', [], { color: '#112233' }), S('B', []), S('C', [], { type: 'area' })]),
    ).toEqual([{ label: 'A', color: '#112233' }, { label: 'B' }, { label: 'C' }]);
    expect(comboKeyItems([S('A', []), S('B', [])])[1]).toEqual({ label: 'B', line: true });
  });

  it('finds the mark a readout sits on', () => {
    expect(comboMarkAt(m, 0, 0)).toEqual(m.bars[0]![0]!.tip);
    expect(comboMarkAt(m, 1, 0)).toEqual(m.points[1]![0]);
    expect(comboMarkAt(m, 0, 2)).toBeNull();
    expect(comboMarkAt(m, 5, 0)).toBeNull();
  });
});

describe('a Combo chart element', () => {
  const el = (): ShapeElement => ({
    ...createShape('line-chart', 0, 0),
    chartVariant: 'combo',
    width: 400,
    height: 260,
    lineCategories: ['Q1', 'Q2'],
    lineSeries: [S('Revenue', [10, 20], { color: '#123456' }), S('Margin', [3, 4])],
  });

  it('exports its columns before its lines, keyed by type', () => {
    const svg = svgLineChart({ ...el(), chartValues: true }, '#000000');
    const rect = svg.indexOf('fill="#123456"/>');
    const stroke = svg.indexOf('stroke-linejoin="round"');
    expect(rect).toBeGreaterThan(-1);
    expect(stroke).toBeGreaterThan(rect);
    expect(svg).toContain('>20</text>');
  });

  it('draws its areas under its columns', () => {
    const svg = svgLineChart(
      { ...el(), lineSeries: [S('A', [1, 2]), S('B', [2, 1], { type: 'area' })] },
      '#000000',
    );
    expect(svg.indexOf('fill-opacity')).toBeLessThan(svg.indexOf('<rect'));
  });

  it('keeps a valid series type through normalising, and drops another', () => {
    const out = normaliseElement({
      ...el(),
      lineSeries: [
        S('A', [1, 2], { type: 'area' }),
        { name: 'B', values: [1, 2], type: 'pie' } as unknown as LineSeries,
      ],
    }) as ShapeElement;
    expect(out.lineSeries![0]!.type).toBe('area');
    expect('type' in out.lineSeries![1]!).toBe(false);
  });

  it('keeps a series type when its table is read again', () => {
    const fields = lineFieldsFromTable(el(), {
      categories: ['Q1'],
      series: [
        { name: 'Revenue', values: [1] },
        { name: 'Margin', values: [2] },
      ],
      named: false,
    });
    expect(fields.lineSeries.map((s) => s.type)).toEqual([undefined, undefined]);
    const typed = lineFieldsFromTable(
      { ...el(), lineSeries: [S('Revenue', [1], { type: 'line' })] },
      { categories: ['Q1'], series: [{ name: 'Revenue', values: [1] }], named: false },
    );
    expect(typed.lineSeries[0]!.type).toBe('line');
  });
});
