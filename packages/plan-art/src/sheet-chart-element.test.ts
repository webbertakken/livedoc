// A spreadsheet's chart as the chart element LiveDoc's chart code draws (docs/specs/029-sheets/charts.md "The model"):
// its type, look and titles carried over, its data read, each series' look by its column, and no data drawn as none.
import { describe, expect, it } from 'vitest';
import { CHART_STACKS, CHART_TYPES, chartTypeOf } from '@livedoc/document';
import {
  emptyChartTable,
  SHEET_CHART_STACKS,
  SHEET_CHART_TYPES,
  type SheetChart,
  type SheetChartTable,
} from '@livedoc/sheets';
import { sheetChartElement } from './sheet-chart-element';

const range = { r1: 'r0000', c1: 'c0000', r2: 'r0003', c2: 'c0002' };
const chart = (x: Partial<SheetChart> = {}): SheetChart => ({
  id: 'chart01',
  kind: 'chart',
  at: { r: 'r0000', c: 'c0004', dx: 0, dy: 0 },
  width: 420,
  height: 280,
  type: 'scatter',
  range,
  ...x,
});
// Cost (the x), Index and Pareto, one empty Pareto cell a gap.
const table: SheetChartTable = {
  ...emptyChartTable(),
  categories: ['1', '2', '3'],
  numbered: true,
  series: [
    { name: 'Cost', col: 'c0000', values: [1, 2, 3] },
    { name: 'Index', col: 'c0001', values: [40, 50, 55] },
    { name: 'Pareto', col: 'c0002', values: [40, null, 55] },
  ],
};
const at = { x: 300, y: 20 };

describe('a spreadsheet chart as a chart element', () => {
  // @livedoc/sheets restates the chart types it never imports: the two lists stay one.
  it('knows every chart type LiveDoc draws, by the same names', () => {
    expect([...SHEET_CHART_TYPES]).toEqual([...CHART_TYPES]);
    expect([...SHEET_CHART_STACKS]).toEqual([...CHART_STACKS]);
  });

  it('draws a scatter of numbers against its first column, a series as a line by its column, gaps kept', () => {
    const el = sheetChartElement(
      chart({ series: { c0002: { line: true, color: '#112233' } } }),
      's1',
      table,
      at,
    );
    expect(chartTypeOf(el)).toBe('scatter');
    expect(el.lineCategories).toEqual(['1', '2', '3']);
    expect(el.lineSeries).toEqual([
      { name: 'Index', values: [40, 50, 55] },
      { name: 'Pareto', values: [40, null, 55], color: '#112233', line: true },
    ]);
    expect(el.chartSource).toEqual({ sheetId: 's1', range });
    expect(el.sheetAnchor).toEqual(at);
    expect([el.width, el.height]).toEqual([420, 280]);
    expect('linePointNames' in el).toBe(false);
  });

  // pie-chart.md "Scatter's point names": a label column of text names the points; the next column is the x.
  it('names a scatter’s points by its column of text, each series’ look still by its column', () => {
    const named: SheetChartTable = {
      ...table,
      categories: ['Haiku', 'Flash', 'Pro'],
      numbered: false,
      named: true,
    };
    const el = sheetChartElement(chart({ series: { c0002: { line: true } } }), 's1', named, at);
    expect(el.linePointNames).toEqual(['Haiku', 'Flash', 'Pro']);
    expect(el.lineCategories).toEqual(['1', '2', '3']);
    expect(el.lineSeries).toEqual([
      { name: 'Index', values: [40, 50, 55] },
      { name: 'Pareto', values: [40, null, 55], line: true },
    ]);
  });

  it('shows the value axis and a bottom legend unless told otherwise, and carries titles and values', () => {
    const plain = sheetChartElement(chart(), 's1', table, at);
    expect([plain.chartAxis, plain.chartLegend, plain.chartLegendPosition]).toEqual([
      true,
      true,
      'bottom',
    ]);
    const told = sheetChartElement(
      chart({
        axis: false,
        legend: 'none',
        values: true,
        title: 'Value',
        xTitle: 'Cost',
        yTitle: 'Index',
        palette: 'vivid',
        stack: 'percent',
        cols: ['c0000', 'c0002'],
      }),
      's1',
      table,
      at,
    );
    expect(told).toMatchObject({
      chartAxis: false,
      chartLegend: false,
      chartValues: true,
      chartTitle: 'Value',
      chartAxisTitles: { x: 'Cost', y: 'Index' },
      chartPalette: 'vivid',
      chartStack: 'percent',
      chartSource: { cols: ['c0000', 'c0002'] },
    });
    expect(told.chartLegendPosition).toBeUndefined();
    expect(plain.chartStack).toBeUndefined();
  });

  it('fills a column chart in its series colour, and leaves a pie its palette', () => {
    const one: SheetChartTable = {
      ...emptyChartTable(),
      categories: ['a', 'b'],
      numbered: false,
      series: [{ name: 'N', col: 'c0001', values: [1, 2] }],
    };
    const looks = { series: { c0001: { color: '#abcdef' } } };
    const column = sheetChartElement(chart({ type: 'column', ...looks }), 's1', one, at);
    expect(column.pieSlices).toEqual([
      { label: 'a', value: 1, color: '#abcdef' },
      { label: 'b', value: 2, color: '#abcdef' },
    ]);
    const pie = sheetChartElement(chart({ type: 'pie', ...looks }), 's1', one, at);
    expect(pie.pieSlices).toEqual([
      { label: 'a', value: 1 },
      { label: 'b', value: 2 },
    ]);
  });

  it('draws a column or bar chart’s every series side by side, each look by its column (D281)', () => {
    const looks = { series: { c0002: { color: '#aa3300' } } };
    for (const type of ['column', 'bar'] as const) {
      const el = sheetChartElement(chart({ type, ...looks }), 's1', table, at);
      expect(el.lineCategories).toEqual(['1', '2', '3']);
      expect(el.lineSeries).toEqual([
        { name: 'Cost', values: [1, 2, 3] },
        { name: 'Index', values: [40, 50, 55] },
        { name: 'Pareto', values: [40, null, 55], color: '#aa3300' },
      ]);
      expect(el.pieSlices).toHaveLength(3);
    }
    // A pie still draws its first.
    expect(sheetChartElement(chart({ type: 'pie' }), 's1', table, at).lineSeries).toBeUndefined();
  });

  it('draws no marks with no data, and reads no range', () => {
    const { range: _r, ...none } = chart();
    const el = sheetChartElement(none, 's1', null, at);
    expect([el.lineSeries, el.lineCategories, el.chartSource]).toEqual([[], [], undefined]);
    expect(sheetChartElement(chart({ type: 'pie' }), 's1', null, at).pieSlices).toEqual([]);
  });
});
