// docs/specs/009-elements/pie-chart.md "Stacking" (D282): an area chart's series each a band on the running total
// before it; 100% as shares, its ticks percents; no value no point and no thickness.
import { describe, expect, it } from 'vitest';
import { lineMarks } from './chart-marks';
import { lineValueLabels } from './chart-values';

const AREA = { x: 0, y: 0, w: 300, h: 200 };
const CATS = ['Q1', 'Q2', 'Q3'];
const SERIES = [
  { name: 'A', values: [1, 2, 3] },
  { name: 'B', values: [3, null, 1], axis: 'right' as const },
];

describe('lineMarks stacked area', () => {
  it('puts each series’ points at its end of the stack, on one axis', () => {
    const m = lineMarks(AREA, CATS, SERIES, 'area', 0, 0, true, 'stacked');
    const [a, b] = [m.points[0]!, m.points[1]!];
    // 1 + 3 = 4 is the top: B's first point higher than A's by three of A's.
    const zero = m.plot.y + m.plot.h;
    expect(zero - b[0]!.y).toBeCloseTo((zero - a[0]!.y) * 4);
    expect(b[1]).toBeNull();
    expect(m.axis.right).toEqual([]);
    // Its line breaks at the gap: two stretches, one of them a lone point, so a path of one run of two.
    expect(m.lines[1]).toBe('');
    expect(m.lines[0]!.split('M')).toHaveLength(2);
  });

  it('fills each band between the totals before and after it, a gap adding nothing', () => {
    const m = lineMarks(AREA, CATS, SERIES, 'area', 0, 0, false, 'stacked');
    const first = m.areas[0]!;
    // A's band runs along its points and back along zero.
    const zero = m.plot.y + m.plot.h;
    expect(first.startsWith(`M ${m.points[0]![0]!.x} ${m.points[0]![0]!.y}`)).toBe(true);
    expect(first.endsWith(`${m.points[0]![0]!.x} ${zero} Z`)).toBe(true);
    // B's band at Q2 is no thicker than nothing: its top there is A's top.
    const second = m.areas[1]!.slice(2, -2).split(' L ');
    expect(second).toHaveLength(6);
    expect(second[1]).toBe(second[4]);
  });

  it('reads 100% as shares, its ticks percents, its values the series’ own', () => {
    const m = lineMarks(AREA, CATS, SERIES, 'area', 0, 0, true, 'percent');
    expect(m.axis.left.at(-1)!.text).toBe('100%');
    // Q2 holds A alone: its whole stack.
    expect(m.points[0]![1]!.y).toBeCloseTo(m.points[1]![0]!.y);
    expect(lineValueLabels(m, SERIES).map((l) => l.text)).toEqual(['1', '2', '3', '3', '1']);
  });

  it('leaves a line chart unstacked', () => {
    const plain = lineMarks(AREA, CATS, SERIES, 'line', 0, 0, true);
    expect(lineMarks(AREA, CATS, SERIES, 'line', 0, 0, true, 'stacked')).toEqual(plain);
  });

  it('draws no band with no categories', () => {
    expect(lineMarks(AREA, [], SERIES, 'area', 0, 0, false, 'stacked').areas).toEqual(['', '']);
  });
});
