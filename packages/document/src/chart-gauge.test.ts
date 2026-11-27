// docs/specs/009-elements/pie-chart.md "Chart types", "Gauge" (D330): a dial per slice in a grid, one shared scale from
// zero to a round value over the greatest, the value's stretch filled, a needle, the value and the label.
import { describe, expect, it } from 'vitest';
import { gaugeGrid, gaugeMarks, isGaugeChart, GAUGE_SWEEP } from './chart-gauge';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import type { PieSlice } from './data-shapes';
import type { ShapeElement } from './index';
import { renderElementsToSvg } from './index';
import { createShape } from './shape-factory';

const AREA = { x: 0, y: 0, w: 400, h: 200 };
const P = (label: string, value: number | null): PieSlice => ({ label, value });
// Google Sheets' help example: annual sales.
const SALES = [
  P('Sales in 2015', 35000),
  P('Sales in 2016', 72000),
  P('Sales in 2017', 52000),
  P('Sales in 2018', 36000),
];

describe('gauge as a chart type', () => {
  it('is a pie chart kind with its own variant, named Gauge', () => {
    expect(chartShapeOf('gauge')).toEqual({ shape: 'pie-chart', chartVariant: 'gauge' });
    expect(chartTypeOf({ shape: 'pie-chart', chartVariant: 'gauge' })).toBe('gauge');
    expect(isGaugeChart({ shape: 'pie-chart', chartVariant: 'gauge' })).toBe(true);
    expect(isGaugeChart({ shape: 'pie-chart' })).toBe(false);
    expect(CHART_TYPE_LABELS.gauge).toBe('Gauge');
  });
});

describe('gaugeGrid', () => {
  it('lays dials out in the grid that gives each the largest square', () => {
    expect(gaugeGrid(4, 400, 200)).toEqual({ cols: 4, rows: 1 });
    expect(gaugeGrid(4, 300, 300)).toEqual({ cols: 2, rows: 2 });
    expect(gaugeGrid(1, 100, 400)).toEqual({ cols: 1, rows: 1 });
    expect(gaugeGrid(0, 100, 100)).toEqual({ cols: 1, rows: 1 });
  });
});

describe('gaugeMarks', () => {
  it('shares one scale from zero to a round value over the greatest', () => {
    const m = gaugeMarks(AREA, SALES);
    expect(m.min).toBe(0);
    expect(m.max).toBe(80000);
    expect(m.dials).toHaveLength(4);
    expect(m.dials[1]!.cx).toBeGreaterThan(m.dials[0]!.cx);
    expect(m.dials[1]!.value).toBe('72k');
    expect(m.dials[0]!.label.text).toBe('Sales in 2015');
    expect(m.ends.map((e) => e.text)).toEqual(['0', '80k', '0', '80k', '0', '80k', '0', '80k']);
  });

  it('points the needle at the value along the sweep, clamped to the scale', () => {
    const m = gaugeMarks({ x: 0, y: 0, w: 200, h: 200 }, [P('Half', 50), P('Top', 100)]);
    const [half, top] = m.dials;
    // Half way along a sweep centred on twelve o'clock points straight up.
    expect(half!.needle!.x).toBeCloseTo(half!.cx);
    expect(half!.needle!.y).toBeLessThan(half!.cy);
    // The greatest points to the sweep's end, right of the centre and below it.
    const end = (GAUGE_SWEEP / 2) * (Math.PI / 180);
    expect(top!.needle!.x - top!.cx).toBeGreaterThan(0);
    expect(Math.sign(-(top!.needle!.y - top!.cy))).toBe(Math.sign(Math.cos(end)));
    expect(half!.fill).toContain(' A ');
  });

  it('reaches below zero, and draws an empty dial for no value', () => {
    const m = gaugeMarks(AREA, [P('Loss', -20), P('None', null), P('Zero', 0)]);
    expect(m.min).toBeLessThan(0);
    expect(m.dials[1]).toMatchObject({ fill: null, needle: null, value: null });
    expect(gaugeMarks(AREA, [P('Zero', 0)]).dials[0]!.fill).toBeNull();
    const wide = gaugeMarks(AREA, [P('Big', 10)]);
    expect(wide.dials[0]!.fill).toContain(' 1 1 ');
  });
});

describe('the gauge in the export', () => {
  it('draws dials, needles, values and labels, and no legend', () => {
    const el: ShapeElement = {
      ...createShape('pie-chart', 0, 0),
      width: 400,
      height: 200,
      chartVariant: 'gauge',
      pieSlices: [{ ...SALES[0]!, color: '#aa3300' }, ...SALES.slice(1), P('None', null)],
    };
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el] }, {});
    expect(svg).toContain('stroke="#aa3300"');
    expect(svg).toContain('>72k</text>');
    expect(svg).toContain('>Sales in 2018</text>');
    expect(svg).toContain('>None</text>');
    expect(svg.split('<circle').length).toBe(5);
  });
});
