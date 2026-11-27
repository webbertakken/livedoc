// docs/specs/009-elements/pie-chart.md "Chart types", "Scorecard" (D370): the first series summed as the key value,
// written large, its name under it, and its change from the second series' sum under that, green over, red under.
import { describe, expect, it } from 'vitest';
import {
  isScorecardChart,
  scorecardMarks,
  scorecardNumber,
  scorecardSum,
  SCORECARD_FALL,
  SCORECARD_KEY_PX_MAX,
  SCORECARD_KEY_PX_MIN,
  SCORECARD_RISE,
} from './chart-scorecard';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { renderElementsToSvg } from './index';
import { createShape } from './shape-factory';

const AREA = { x: 10, y: 20, w: 400, h: 200 };
const S = (name: string, values: (number | null)[]): LineSeries => ({ name, values });
// Google Sheets' help example: total revenue by month, the key value April to June against January to March.
const KEY = S('Total Revenue', [1500, 2250, 1750]);
const BASELINE = S('Before', [2500, 2000, 2200]);

describe('scorecard as a chart type', () => {
  it('is a line chart kind with its own variant, named Scorecard', () => {
    expect(chartShapeOf('scorecard')).toEqual({ shape: 'line-chart', chartVariant: 'scorecard' });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'scorecard' })).toBe('scorecard');
    expect(isScorecardChart({ shape: 'line-chart', chartVariant: 'scorecard' })).toBe(true);
    expect(isScorecardChart({ shape: 'line-chart' })).toBe(false);
    expect(CHART_TYPE_LABELS.scorecard).toBe('Scorecard');
  });
});

describe('scorecardSum', () => {
  it('adds up the values, a gap not counted, none at all no value', () => {
    expect(scorecardSum([1500, null, 2250])).toBe(3750);
    expect(scorecardSum([2500])).toBe(2500);
    expect(scorecardSum([null, null])).toBeNull();
    expect(scorecardSum([])).toBeNull();
    expect(scorecardSum([0.1, 0.2])).toBe(0.3);
  });
});

describe('scorecardNumber', () => {
  it('writes a number in full, thousands separated, up to two decimals', () => {
    expect(scorecardNumber(12345.678)).toBe('12,345.68');
    expect(scorecardNumber(6700)).toBe('6,700');
    expect(scorecardNumber(-0.5)).toBe('-0.5');
  });
});

describe('scorecardMarks', () => {
  it('writes the key value in the middle, its name under it, a fall in red under that', () => {
    const m = scorecardMarks(AREA, [KEY, BASELINE]);
    expect(m.key).toMatchObject({ text: '5,500', x: 210 });
    expect(m.name).toMatchObject({ text: 'Total Revenue', x: 210 });
    expect(m.change).toMatchObject({ text: '▼ 1,200', tone: 'fall' });
    expect(m.name.y).toBeGreaterThan(m.key!.y);
    expect(m.change!.y).toBeGreaterThan(m.name.y);
    // The three lines sit round the plot's middle.
    expect(m.key!.y - m.key!.px).toBeGreaterThan(AREA.y);
    expect(m.change!.y).toBeLessThan(AREA.y + AREA.h);
  });

  it('writes a rise, and level as 0', () => {
    expect(scorecardMarks(AREA, [BASELINE, KEY]).change).toMatchObject({
      text: '▲ 1,200',
      tone: 'rise',
    });
    expect(scorecardMarks(AREA, [KEY, S('Same', [5500])]).change).toMatchObject({
      text: '0',
      tone: 'level',
    });
  });

  it('writes one cell as itself, with no change and no baseline', () => {
    const m = scorecardMarks(AREA, [S('Total Revenue', [2500])]);
    expect(m.key!.text).toBe('2,500');
    expect(m.change).toBeNull();
  });

  it('writes no number and no change for a key with no value, nor a change for a baseline with none', () => {
    const none = scorecardMarks(AREA, [S('Empty', [null]), BASELINE]);
    expect(none.key).toBeNull();
    expect(none.change).toBeNull();
    expect(none.name.text).toBe('Empty');
    expect(scorecardMarks(AREA, [KEY, S('Empty', [null])]).change).toBeNull();
  });

  it('sizes the key value to fit the plot, from 12 to 64 px', () => {
    expect(scorecardMarks({ x: 0, y: 0, w: 800, h: 800 }, [KEY]).key!.px).toBe(
      SCORECARD_KEY_PX_MAX,
    );
    expect(scorecardMarks({ x: 0, y: 0, w: 400, h: 100 }, [KEY]).key!.px).toBe(40);
    const narrow = scorecardMarks({ x: 0, y: 0, w: 60, h: 400 }, [S('Big', [123456789])]);
    expect(narrow.key!.px).toBe(SCORECARD_KEY_PX_MIN);
  });

  it('reads the default series with none, and shifts by the origin', () => {
    const m = scorecardMarks({ x: 0, y: 0, w: 200, h: 100 }, [], 5, 7);
    expect(m.key).not.toBeNull();
    expect(m.name.x).toBe(105);
  });
});

describe('the scorecard in the export', () => {
  const chart = (lineSeries: LineSeries[]): ShapeElement => ({
    ...createShape('line-chart', 0, 0),
    width: 400,
    height: 200,
    chartVariant: 'scorecard',
    lineCategories: ['Apr', 'May', 'Jun'],
    lineSeries,
  });

  it('draws the key value, its name and the change in its colour, and no legend', () => {
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [chart([KEY, BASELINE])] }, {});
    expect(svg).toContain('>5,500</text>');
    expect(svg).toContain('>Total Revenue</text>');
    expect(svg).toContain(`fill="${SCORECARD_FALL}"`);
    expect(svg).toContain('>▼ 1,200</text>');
    expect(svg).not.toContain('>Before</text>');
    const rise = renderElementsToSvg(
      { id: 't', name: 'T', elements: [chart([BASELINE, KEY])] },
      {},
    );
    expect(rise).toContain(`fill="${SCORECARD_RISE}"`);
  });

  it('writes a level change in the text colour, and reads the default series with none', () => {
    const level = renderElementsToSvg(
      { id: 't', name: 'T', elements: [chart([KEY, S('Same', [5500])])] },
      {},
    );
    expect(level).toContain('>0</text>');
    expect(level).not.toContain(SCORECARD_RISE);
    expect(level).not.toContain(SCORECARD_FALL);
    const bare = { ...chart([]), lineSeries: undefined };
    expect(renderElementsToSvg({ id: 't', name: 'T', elements: [bare] }, {})).toContain(
      'font-weight="700"',
    );
  });

  it('draws the name alone for a key with no value', () => {
    const svg = renderElementsToSvg(
      { id: 't', name: 'T', elements: [chart([S('Empty', [null, null, null])])] },
      {},
    );
    expect(svg).toContain('>Empty</text>');
    expect(svg).not.toContain('font-weight="700"');
  });
});
