// docs/specs/009-elements/pie-chart.md "Chart types", "Candlestick and OHLC" (D322): open, high, low, close by column
// (high, low, close with three), slots as a column chart's, the range fitted, a falling body filled, a gap where any
// price is missing.
import { describe, expect, it } from 'vitest';
import {
  isStockChart,
  STOCK_BODY_MAX,
  stockBody,
  stockMarks,
  stockPath,
  stockPrices,
  stockReadout,
  stockValueLabels,
} from './chart-stock';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { createShape } from './shape-factory';
import { renderElementsToSvg } from './index';

const AREA = { x: 0, y: 0, w: 400, h: 200 };
const DAYS = ['Mon', 'Tue', 'Wed'];
const S = (name: string, values: (number | null)[]): LineSeries => ({ name, values });
const OHLC = [
  S('Open', [20, 50, 45]),
  S('High', [70, 66, null]),
  S('Low', [15, 25, 30]),
  S('Close', [50, 45, 62]),
];

describe('candlestick and OHLC as chart types', () => {
  it('are line chart kinds with their own variants, named Candlestick and OHLC', () => {
    expect(chartShapeOf('candlestick')).toEqual({
      shape: 'line-chart',
      chartVariant: 'candlestick',
    });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'ohlc' })).toBe('ohlc');
    expect(isStockChart({ shape: 'line-chart', chartVariant: 'candlestick' })).toBe(true);
    expect(isStockChart({ shape: 'line-chart', chartVariant: 'ohlc' })).toBe(true);
    expect(isStockChart({ shape: 'line-chart', chartVariant: 'radar' })).toBe(false);
    expect(CHART_TYPE_LABELS.ohlc).toBe('OHLC');
    expect(CHART_TYPE_LABELS.candlestick).toBe('Candlestick');
  });
});

describe('stockPrices', () => {
  it('reads open, high, low, close from four series, high, low, close from three, none from fewer', () => {
    expect(stockPrices(OHLC, 0)).toEqual({ open: 20, high: 70, low: 15, close: 50 });
    expect(stockPrices(OHLC.slice(1), 0)).toEqual({ open: null, high: 70, low: 15, close: 50 });
    expect(stockPrices(OHLC.slice(2), 0)).toBeNull();
  });

  it('is a gap where any price is missing', () => {
    expect(stockPrices(OHLC, 2)).toBeNull();
    expect(stockPrices([S('O', [null]), ...OHLC.slice(1)], 0)).toBeNull();
    expect(stockPrices([S('H', [1]), S('L', [null]), S('C', [1])], 0)).toBeNull();
    expect(stockPrices([S('H', [1]), S('L', [1]), S('C', [null])], 0)).toBeNull();
  });
});

describe('stockMarks', () => {
  const m = stockMarks(AREA, DAYS, OHLC);

  it('puts each category in a slot, fitting the range to the prices', () => {
    const [mon, tue, gap] = m.marks;
    expect(gap).toBeNull();
    expect(tue!.x - mon!.x).toBeCloseTo(m.plot.w / 3);
    // High above low, the fitted range not running down to zero.
    expect(mon!.top).toBeLessThan(mon!.bottom);
    expect(mon!.bottom).toBeLessThan(m.plot.y + m.plot.h);
    expect(m.labels.map((l) => l.text)).toEqual(DAYS);
  });

  it('marks a falling candle and a rising one, its body 60% of its slot and at most 24 px', () => {
    expect(m.marks[0]!.rising).toBe(true);
    expect(m.marks[1]!.rising).toBe(false);
    expect(m.marks[0]!.half * 2).toBe(STOCK_BODY_MAX);
    const narrow = stockMarks({ x: 0, y: 0, w: 60, h: 200 }, DAYS, OHLC);
    expect(narrow.marks[0]!.half * 2).toBeCloseTo(((60 - 18) / 3) * 0.6);
  });

  it('draws a wick around the body, or a line with ticks', () => {
    const mon = m.marks[0]!;
    const body = stockBody(mon)!;
    expect(body.h).toBeCloseTo(mon.open! - mon.close);
    expect(stockPath(mon, true).split('M')).toHaveLength(3);
    expect(stockPath(mon, false).split('M')).toHaveLength(4);
    const hlc = stockMarks(AREA, DAYS, OHLC.slice(1)).marks[0]!;
    expect(stockBody(hlc)).toBeNull();
    expect(stockPath(hlc, true).split('M')).toHaveLength(3);
    // An open equal to its close is a line a pixel tall.
    const flat = stockMarks(AREA, ['A'], [S('O', [5]), S('H', [9]), S('L', [1]), S('C', [5])]);
    expect(stockBody(flat.marks[0]!)!.h).toBe(1);
  });

  it('draws nothing, over 0 to 1, with no prices; Show Axis ticks and an offset shift', () => {
    const none = stockMarks(AREA, DAYS, OHLC.slice(2), 0, 0, true);
    expect(none.marks).toEqual([null, null, null]);
    expect(none.axis.left.map((t) => t.text)).toContain('1');
    const shifted = stockMarks(AREA, DAYS, OHLC, 10, 20);
    expect(shifted.marks[0]!.x - m.marks[0]!.x).toBeCloseTo(10);
    expect(shifted.marks[0]!.top - m.marks[0]!.top).toBeCloseTo(20);
    expect(m.axis.left).toEqual([]);
  });

  it('prints each close to the right of its mark and reads its prices', () => {
    const labels = stockValueLabels(m, OHLC);
    expect(labels.map((l) => l.text)).toEqual(['50', '45']);
    expect(labels[0]!.x).toBeGreaterThan(m.marks[0]!.x + m.marks[0]!.half);
    expect(stockReadout(DAYS, OHLC, 0)).toBe('Mon · Open 20, High 70, Low 15, Close 50');
    expect(stockReadout([], OHLC.slice(1), 0)).toBe(' · High 70, Low 15, Close 50');
  });
});

describe('a Candlestick chart rendered', () => {
  const el = (variant: 'candlestick' | 'ohlc'): ShapeElement => ({
    ...createShape('line-chart', 0, 0),
    width: 400,
    height: 300,
    chartVariant: variant,
    chartAxis: true,
    chartValues: true,
    lineCategories: DAYS,
    lineSeries: OHLC.map((s, i) => (i === 0 ? { ...s, color: '#aa3300' } : s)),
  });

  it('draws bodies, a falling one filled, wicks, closes and no legend', () => {
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el('candlestick')] }, {});
    expect(svg.split('<rect').length).toBeGreaterThanOrEqual(3);
    expect(svg).toContain('fill="#aa3300" stroke="#aa3300"');
    expect(svg).toContain('fill="none" stroke="#aa3300" stroke-width="1.5"/><rect');
    expect(svg).toContain('>45</text>');
    expect(svg).not.toContain('>Open</text>');
  });

  it('draws OHLC as lines with ticks, and the sample data with none of its own', () => {
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el('ohlc')] }, {});
    expect(svg).toContain('stroke="#aa3300" stroke-width="1.5"/>');
    const bare = { ...el('ohlc'), lineCategories: [], lineSeries: [], chartValues: false };
    expect(renderElementsToSvg({ id: 't', name: 'T', elements: [bare] }, {})).toContain('<path');
  });
});
