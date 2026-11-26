// docs/specs/009-elements/pie-chart.md "Chart types", "Bubble" (D297): a scatter's data, the last of two or more series
// the sizes, each bubble's area in proportion to its size, largest first, names inside when they fit.
import { describe, expect, it } from 'vitest';
import {
  BUBBLE_RADIUS_MAX,
  BUBBLE_RADIUS_MIN,
  bubbleMarks,
  bubbleNames,
  bubbleReadout,
  bubbleSeriesOf,
  bubbleValueLabels,
  isBubbleChart,
} from './chart-bubble';
import { lineFieldsFromTable } from './chart-source';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS, readsXFromNumbers } from './chart-types';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { createShape } from './shape-factory';
import { renderElementsToSvg } from './index';

const AREA = { x: 0, y: 0, w: 400, h: 300 };
const XS = ['1', '2', '3', '4'];
const S = (name: string, values: (number | null)[]): LineSeries => ({ name, values });

describe('bubble as a chart type', () => {
  it('is a line chart kind with its own variant, named Bubble, reading its x from numbers', () => {
    expect(chartShapeOf('bubble')).toEqual({ shape: 'line-chart', chartVariant: 'bubble' });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'bubble' })).toBe('bubble');
    expect(isBubbleChart({ shape: 'line-chart', chartVariant: 'bubble' })).toBe(true);
    expect(isBubbleChart({ shape: 'line-chart', chartVariant: 'scatter' })).toBe(false);
    expect(CHART_TYPE_LABELS.bubble).toBe('Bubble');
    expect(readsXFromNumbers('bubble')).toBe(true);
    expect(readsXFromNumbers('scatter')).toBe(true);
    expect(readsXFromNumbers('line')).toBe(false);
  });

  it('reads a sheet as a scatter does: names, then x, then its series and sizes (pie-chart.md "Charts drawn from a sheet")', () => {
    const fields = lineFieldsFromTable(
      { shape: 'line-chart', chartVariant: 'bubble' },
      {
        categories: ['Haiku', 'Opus'],
        named: true,
        series: [S('Cost', [1, 15]), S('Score', [40, 70]), S('Speed', [90, 30])],
      },
    );
    expect(fields.lineCategories).toEqual(['1', '15']);
    expect(fields.linePointNames).toEqual(['Haiku', 'Opus']);
    expect(fields.lineSeries.map((s) => s.name)).toEqual(['Score', 'Speed']);
  });
});

describe('bubbleSeriesOf', () => {
  it('takes the last of two or more series as the sizes', () => {
    const [a, b, c] = [S('A', [1]), S('B', [2]), S('Size', [3])];
    expect(bubbleSeriesOf([a, b, c])).toEqual({ drawn: [a, b], sizes: c });
    expect(bubbleSeriesOf([a])).toEqual({ drawn: [a], sizes: null });
  });
});

describe('bubbleMarks', () => {
  const m = bubbleMarks(AREA, XS, [S('Y', [1, 2, 3, 4]), S('Size', [1, 4, null, 0])]);

  it('sizes each bubble by area against the largest, the largest a tenth of the shorter side', () => {
    const largest = 30; // 300 / 10, held at the most
    const byRow = Object.fromEntries(m.bubbles.map((b) => [b.i, b.r]));
    expect(byRow[1]).toBeCloseTo(largest);
    expect(byRow[0]).toBeCloseTo(largest / 2);
    expect(Object.keys(byRow)).toEqual(['0', '1']);
  });

  it('draws no bubble, no point, where its size is no value or not above zero', () => {
    expect(m.points[0]![2]).toBeNull();
    expect(m.points[0]![3]).toBeNull();
    expect(m.points).toHaveLength(1);
  });

  it('draws the largest first and joins no lines', () => {
    expect(m.bubbles.map((b) => b.i)).toEqual([1, 0]);
    expect(m.lines).toEqual(['']);
  });

  it('draws the plot in by the largest radius, reporting the whole plot', () => {
    expect(m.plot.x).toBeLessThan(m.bubbles[1]!.x);
    const lastX = bubbleMarks(AREA, XS, [S('Y', [1, 2, 3, 4])]).points[0]![3]!.x;
    expect(m.plot.x + m.plot.w - lastX).toBeGreaterThanOrEqual(BUBBLE_RADIUS_MAX - 0.01);
  });

  it('draws one size, half the largest, with no sizes; the largest never under the least', () => {
    const one = bubbleMarks({ x: 0, y: 0, w: 40, h: 40 }, XS, [S('Y', [1, 2, 3, 4])]);
    expect(one.bubbles.map((b) => b.r)).toEqual([3, 3, 3, 3]);
    expect(BUBBLE_RADIUS_MIN / 2).toBe(3);
  });

  it('shifts every bubble by the offset, and keeps Show Axis ticks', () => {
    const shifted = bubbleMarks(AREA, XS, [S('Y', [1, 2, 3, 4])], 100, 50, true);
    const plain = bubbleMarks(AREA, XS, [S('Y', [1, 2, 3, 4])], 0, 0, true);
    expect(shifted.bubbles[0]!.x - plain.bubbles[0]!.x).toBeCloseTo(100);
    expect(shifted.bubbles[0]!.y - plain.bubbles[0]!.y).toBeCloseTo(50);
    expect(plain.axis.left.length).toBeGreaterThan(1);
  });

  it('prints each bubble’s value over its top edge', () => {
    const labels = bubbleValueLabels(m);
    expect(labels.map((l) => l.text)).toEqual(['2', '1']);
    expect(labels[0]!.y).toBeLessThan(m.bubbles[0]!.y - m.bubbles[0]!.r);
  });
});

describe('bubble names and readouts', () => {
  const m = bubbleMarks(AREA, XS, [S('Y', [1, 2, 3, 4]), S('Size', [1, 100, 1, 1])]);

  it('writes a name in its bubble only where it fits', () => {
    const names = bubbleNames(m, ['Haiku', 'Opus', '', 'A name far too long to fit']);
    expect(names.map((n) => n.text)).toEqual(['Opus']);
    expect(bubbleNames(m, undefined)).toEqual([]);
    expect(bubbleNames(m, ['', 'B']).map((n) => n.text)).toEqual(['B']);
  });

  it('reads name, y, x, size when named, else x · series: y, size', () => {
    const series = [S('Score', [40, 70]), S('Speed', [90, null])];
    expect(bubbleReadout(['1', '15'], series, ['Haiku', 'Opus'], 0, 0)).toBe('Haiku, 40, 1, 90');
    expect(bubbleReadout(['1', '15'], series, undefined, 0, 0)).toBe('1 · Score: 40, 90');
    expect(bubbleReadout(['1', '15'], series, ['Haiku', ''], 0, 1)).toBe('15 · Score: 70');
    expect(bubbleReadout(['1'], [S('Y', [5])], undefined, 0, 0)).toBe('1 · Y: 5');
    expect(bubbleReadout([], [], undefined, 0, 0)).toBe(' · : null');
    expect(bubbleReadout([], series, ['Haiku'], 0, 0)).toBe('Haiku, 40, , 90');
  });
});

describe('a Bubble chart rendered', () => {
  const el: ShapeElement = {
    ...createShape('line-chart', 0, 0),
    width: 400,
    height: 300,
    chartVariant: 'bubble',
    chartAxis: true,
    chartValues: true,
    lineCategories: XS,
    linePointNames: ['A', 'B', 'C', 'D'],
    lineSeries: [S('Y', [1, 2, 3, 4]), S('Size', [10, 20, 30, 40])],
  };

  it('draws its bubbles at 60%, names inside, values, axes and one key', () => {
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el] }, {});
    expect(svg.split('fill-opacity="0.6"')).toHaveLength(5);
    expect(svg).toContain('>D</text>');
    expect(svg).toContain('>Y</text>');
    expect(svg).not.toContain('>Size</text>');
  });

  it('draws the sample data with none of its own', () => {
    const bare: ShapeElement = { ...el, lineCategories: [], lineSeries: [], chartValues: false };
    expect(renderElementsToSvg({ id: 't', name: 'T', elements: [bare] }, {})).toContain('<circle');
  });
});
