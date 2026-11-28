// docs/specs/029-sheets/plan-links.md "The Sheet Chart from a spreadsheet" (D508): a spreadsheet's chart named by its
// id, or a new one over a range, drawn by the spreadsheet's own chart code from the sheet as last read.
import { describe, expect, it } from 'vitest';
import {
  applySheetWrite,
  emptySheet,
  NOBODY,
  Workbook,
  type Sheet,
  type SheetChart,
} from '@livedoc/sheets';
import type { DashboardSheetChart } from '@livedoc/document';
import {
  linkedChartElement,
  linkedChartLabel,
  linkedSheetCharts,
  newLinkedChart,
} from './spreadsheet-chart';

const rows = ['r1', 'r2', 'r3'];
const cols = ['c1', 'c2'];
const chart: SheetChart = {
  id: 'ch1',
  kind: 'chart',
  type: 'pie',
  at: { r: 'r1', c: 'c2', dx: 0, dy: 0 },
  width: 300,
  height: 200,
  range: { r1: 'r1', c1: 'c1', r2: 'r3', c2: 'c2' },
  title: 'Spend',
};

function read(objects: Sheet['layout']['objects'] = [chart]) {
  let sheet: Sheet = emptySheet({
    id: 'sheetA',
    tabId: 'tabA',
    title: 'Costs',
    layout: { rows, cols },
  });
  sheet = applySheetWrite(
    sheet,
    {
      kind: 'cells',
      cells: [
        { r: 'r1', c: 'c1', i: { s: 'Item' } },
        { r: 'r1', c: 'c2', i: { s: 'Spent' } },
        { r: 'r2', c: 'c1', i: { s: 'Rent' } },
        { r: 'r2', c: 'c2', i: { n: 1200 } },
        { r: 'r3', c: 'c1', i: { s: 'Food' } },
        { r: 'r3', c: 'c2', i: { n: 300 } },
      ],
    },
    { now: 0, by: NOBODY },
  ).sheet;
  sheet = { ...sheet, layout: { ...sheet.layout, ...(objects ? { objects } : {}) } };
  return { sheet, wb: new Workbook({ sheets: [sheet], locale: 'en-GB' }), locale: 'en-GB' };
}
const at = { type: 'sheet-chart' as const, documentId: 'book1', sheetId: 'sheetA' };
const SIZE = { width: 420, height: 260 };

describe('a Sheet Chart from a spreadsheet', () => {
  it('lists the sheet’s charts by type and range', () => {
    const { sheet } = read();
    expect(linkedSheetCharts(sheet).map((c) => c.id)).toEqual(['ch1']);
    expect(linkedChartLabel(chart, sheet)).toBe('Pie Chart · A1:B3');
    expect(linkedChartLabel({ ...chart, range: undefined }, sheet)).toBe('Pie Chart');
    expect(linkedSheetCharts(read([]).sheet)).toEqual([]);
  });

  it('makes a new one over a range typed as A1, none for anything else', () => {
    const { sheet } = read();
    expect(newLinkedChart('book1', sheet, ' a1:b3 ', 'bar')).toEqual({
      ...at,
      range: { r1: 'r1', c1: 'c1', r2: 'r3', c2: 'c2' },
      chartType: 'bar',
    });
    expect(newLinkedChart('book1', sheet, 'A1:C9', 'bar')).toBeNull();
    expect(newLinkedChart('book1', sheet, 'nonsense', 'bar')).toBeNull();
  });

  it('draws the named chart with its look and its cells’ data, at the slot’s size', () => {
    const el = linkedChartElement({ ...at, chartId: 'ch1' }, read(), 's1', SIZE)!;
    expect(el).toMatchObject({
      shape: 'pie-chart',
      x: 0,
      y: 0,
      width: 420,
      height: 260,
      chartTitle: 'Spend',
    });
    expect(el.sheetAnchor).toBeUndefined();
    expect(el.pieSlices?.map((s) => s.value)).toEqual([1200, 300]);
  });

  it('draws a new one of its type over its range, and nothing for a chart deleted', () => {
    const content: DashboardSheetChart = {
      ...at,
      range: { r1: 'r1', c1: 'c1', r2: 'r3', c2: 'c2' },
      chartType: 'line',
    };
    const el = linkedChartElement(content, read(), 's1', SIZE)!;
    expect(el).toMatchObject({ shape: 'line-chart', id: 'slot-chart-s1', width: 420 });
    expect(linkedChartElement({ ...at, chartId: 'gone' }, read(), 's1', SIZE)).toBeNull();
  });
});
