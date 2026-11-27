// docs/specs/009-elements/pie-chart.md "Chart types", "Timeline" (D347): points placed by date along a time axis, a
// line per series in date order broken at a gap, no markers, round date labels, the value range fitted.
import { describe, expect, it } from 'vitest';
import {
  isTimelineChart,
  timelineDateText,
  timelineMarks,
  timeTicks,
  TIMELINE_LABEL_PX,
} from './chart-timeline';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { renderElementsToSvg } from './index';
import { createShape } from './shape-factory';

const AREA = { x: 0, y: 0, w: 600, h: 240 };
const S = (name: string, values: (number | null)[]): LineSeries => ({ name, values });
// Google Sheets' help example: expenses on the first of each month, 2018.
const MONTHS = ['2018-01-01', '2018-02-01', '2018-03-01', '2018-04-01', '2018-05-01'];
const EXPENSES = S('Expenses', [300, 320, 200, 215, 245]);
const DAY = 86_400_000;
const T = (y: number, m: number, d = 1, h = 0) => Date.UTC(y, m - 1, d, h);

describe('timeline as a chart type', () => {
  it('is a line chart kind with its own variant, named Timeline', () => {
    expect(chartShapeOf('timeline')).toEqual({ shape: 'line-chart', chartVariant: 'timeline' });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'timeline' })).toBe('timeline');
    expect(isTimelineChart({ shape: 'line-chart', chartVariant: 'timeline' })).toBe(true);
    expect(isTimelineChart({ shape: 'line-chart' })).toBe(false);
    expect(CHART_TYPE_LABELS.timeline).toBe('Timeline');
  });
});

describe('timelineDateText', () => {
  it('writes a day, and its time when it has one', () => {
    expect(timelineDateText(T(2018, 2, 8))).toBe('Feb 8, 2018');
    expect(timelineDateText(T(2018, 2, 8, 9) + 30 * 60_000)).toBe('Feb 8, 2018 09:30');
  });
});

describe('timeTicks', () => {
  const texts = (lo: number, hi: number, w = 600) => timeTicks(lo, hi, w).map((t) => t.text);

  it('labels months over a few months, at most one label per 80 px', () => {
    expect(texts(T(2018, 1), T(2018, 5))).toEqual([
      'Jan 2018',
      'Feb 2018',
      'Mar 2018',
      'Apr 2018',
      'May 2018',
    ]);
    expect(timeTicks(T(2018, 1), T(2018, 12), 400).length).toBeLessThanOrEqual(
      400 / TIMELINE_LABEL_PX,
    );
  });

  it('labels years, quarters, weeks, days and hours as the span asks', () => {
    expect(texts(T(2000, 1), T(2020, 1))).toEqual(['2000', '2005', '2010', '2015', '2020']);
    expect(texts(T(2018, 1), T(2019, 12))).toEqual([
      'Jan 2018',
      'Jul 2018',
      'Jan 2019',
      'Jul 2019',
    ]);
    expect(texts(T(2018, 1), T(2018, 7), 400)).toEqual(['Jan 2018', 'Apr 2018', 'Jul 2018']);
    expect(texts(T(2018, 1, 1), T(2018, 1, 29), 400)).toEqual([
      'Jan 1',
      'Jan 8',
      'Jan 15',
      'Jan 22',
      'Jan 29',
    ]);
    expect(texts(T(2018, 1, 1), T(2018, 1, 5))).toEqual([
      'Jan 1',
      'Jan 2',
      'Jan 3',
      'Jan 4',
      'Jan 5',
    ]);
    expect(texts(T(2018, 1, 1), T(2018, 1, 1, 12), 400)).toEqual([
      'Jan 1 00:00',
      'Jan 1 03:00',
      'Jan 1 06:00',
      'Jan 1 09:00',
      'Jan 1 12:00',
    ]);
  });

  it('places each label along the span, and gives one for a single instant', () => {
    const ticks = timeTicks(T(2018, 1), T(2018, 3), 600);
    expect(ticks[0]!.t).toBe(T(2018, 1));
    expect(ticks.at(-1)!.t).toBe(T(2018, 3));
    expect(timeTicks(T(2018, 1), T(2018, 1), 600)).toEqual([{ t: T(2018, 1), text: 'Jan 1' }]);
  });

  it('starts at the first round date inside a span that starts between them', () => {
    expect(texts(T(2018, 1, 15), T(2018, 4, 15))).toEqual(['Feb 2018', 'Mar 2018', 'Apr 2018']);
    expect(texts(T(2001, 6), T(2010, 6))).toEqual(['2002', '2004', '2006', '2008', '2010']);
    expect(timeTicks(T(2018, 1, 1, 9), T(2018, 1, 1, 9), 600)).toEqual([
      { t: T(2018, 1, 1, 9), text: 'Jan 1 09:00' },
    ]);
  });

  it('keeps to millennia past its longest step', () => {
    expect(texts(Date.UTC(-2000, 0), T(2020, 1), 160)).toEqual([
      '-2000',
      '-1000',
      '0',
      '1000',
      '2000',
    ]);
  });

  it('runs to centuries for very long spans', () => {
    expect(texts(T(1500, 1), T(2000, 1), 600)).toEqual([
      '1500',
      '1600',
      '1700',
      '1800',
      '1900',
      '2000',
    ]);
  });
});

describe('timelineMarks', () => {
  it('places points by date, so an uneven gap reads as one', () => {
    const m = timelineMarks(AREA, ['2018-01-01', '2018-01-02', '2018-01-11'], [S('A', [1, 2, 3])]);
    const [a, b, c] = m.points[0]!;
    expect((c!.x - b!.x) / (b!.x - a!.x)).toBeCloseTo(9);
    expect(m.dot).toBe(0);
    expect(m.labels.length).toBeGreaterThan(1);
  });

  it('fits the value range, and draws a line per series in date order, broken at a gap', () => {
    const m = timelineMarks(
      AREA,
      ['2018-03-01', '2018-01-01', '2018-02-01', '2018-04-01', '2018-05-01'],
      [S('A', [3, 1, 2, null, 5]), S('B', [1, null, null, 2, null])],
    );
    // In date order: Jan, Feb, Mar joined; Apr has no value; May alone draws no stretch.
    expect(m.lines[0]!.match(/M/g)).toHaveLength(1);
    expect(m.lines[0]!.match(/L/g)).toHaveLength(2);
    expect(m.lines[1]).toContain('M');
    // Fitted, not from zero: the least value sits at the plot's foot.
    const ys = m.points[0]!.filter((p) => p !== null).map((p) => p.y);
    expect(Math.max(...ys)).toBeGreaterThan(m.plot.y + m.plot.h * 0.8);
  });

  it('draws no point for a category that is no date', () => {
    const m = timelineMarks(AREA, ['2018-01-01', 'Later', '2018-01-03'], [S('A', [1, 2, 3])]);
    expect(m.points[0]![1]).toBeNull();
    expect(m.lines[0]).toContain('L');
  });

  it('spaces the points evenly, named by their categories, when none is a date', () => {
    const m = timelineMarks(AREA, ['Q1', 'Q2', 'Q3'], [S('A', [1, 2, 3])], 0, 0, true);
    expect(m.labels.map((l) => l.text)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(m.dot).toBe(0);
    expect(m.axis.left.length).toBeGreaterThan(0);
  });

  it('shifts by the origin', () => {
    const a = timelineMarks(AREA, MONTHS, [EXPENSES]);
    const b = timelineMarks(AREA, MONTHS, [EXPENSES], 10, 20);
    expect(b.points[0]![0]!.x - a.points[0]![0]!.x).toBe(10);
    expect(b.labels[0]!.x - a.labels[0]!.x).toBe(10);
  });

  it('spans whole days around a single date', () => {
    const m = timelineMarks(AREA, ['2018-01-01'], [S('A', [4])]);
    expect(m.points[0]![0]).not.toBeNull();
    expect(m.labels.map((l) => l.text)).toEqual(['Jan 1']);
    expect(DAY).toBeGreaterThan(0);
  });
});

describe('the timeline in the export', () => {
  it('draws its lines with no markers and date labels', () => {
    const el: ShapeElement = {
      ...createShape('line-chart', 0, 0),
      width: 600,
      height: 300,
      chartVariant: 'timeline',
      lineCategories: MONTHS,
      lineSeries: [{ ...EXPENSES, color: '#aa3300' }],
    };
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el] }, {});
    expect(svg).toContain('stroke="#aa3300"');
    expect(svg).not.toContain('<circle');
    expect(svg).toContain('>Mar 2018</text>');
  });
});
