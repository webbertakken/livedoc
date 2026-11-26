// Where a spreadsheet's chart sits and the type Insert › Chart suggests (docs/specs/029-sheets/charts.md "The model",
// "Inserting").
import { describe, expect, it } from 'vitest';
import { emptyChartTable, sheetFromJson, type SheetChartTable, type SheetJson } from '@livedoc/sheets';
import {
  anchorAt,
  anchorPx,
  labelsAreDates,
  newSheetChart,
  suggestChartType,
} from './sheet-chart-place';

// Rows 20 px tall (row 2 hidden), columns 100 px wide.
const lines = {
  rows: Float64Array.from([0, 20, 40, 40, 60, 80, 100]),
  cols: Float64Array.from([0, 100, 200, 300, 400]),
};
const layout = {
  rows: ['r0000', 'r0001', 'r0002', 'r0003', 'r0004', 'r0005'],
  cols: ['c0000', 'c0001', 'c0002', 'c0003'],
};

describe('a chart anchor', () => {
  it('is a cell and the px into it, both ways', () => {
    const at = { r: 'r0003', c: 'c0002', dx: 5, dy: 7 };
    expect(anchorPx(at, layout, lines)).toEqual({ x: 205, y: 47 });
    expect(anchorAt({ x: 205, y: 47 }, layout, lines)).toEqual(at);
  });

  it('never lands on a hidden row, nor past the last line, nor before A1', () => {
    expect(anchorAt({ x: 10, y: 40 }, layout, lines).r).toBe('r0003');
    expect(anchorAt({ x: 950, y: 500 }, layout, lines)).toEqual({
      r: 'r0005',
      c: 'c0003',
      dx: 650,
      dy: 420,
    });
    expect(anchorAt({ x: -5, y: -5 }, layout, lines)).toEqual({
      r: 'r0000',
      c: 'c0000',
      dx: 0,
      dy: 0,
    });
  });

  it('reads a cell no longer in the sheet as A1', () => {
    expect(anchorPx({ r: 'gone1', c: 'gone2', dx: 3, dy: 4 }, layout, lines)).toEqual({
      x: 3,
      y: 4,
    });
  });
});

const table = (categories: string[], ...series: (number | null)[][]): SheetChartTable => ({
  ...emptyChartTable(),
  categories,
  numbered: categories.every((c, i) => c === String(i + 1)),
  series: series.map((values, i) => ({ name: `S${i}`, col: `c000${i}`, values })),
});

describe('the suggested type', () => {
  it('suggests a pie for one series of shares over a few labels', () => {
    expect(suggestChartType(table(['a', 'b', 'c'], [1, 2, 3]), false)).toBe('pie');
  });

  it('suggests a column chart for several series, negatives or many labels', () => {
    expect(suggestChartType(table(['a', 'b'], [1, 2], [3, 4]), false)).toBe('column');
    expect(suggestChartType(table(['a', 'b'], [1, -2]), false)).toBe('column');
    const nine = Array.from({ length: 9 }, (_, i) => `l${i}`);
    expect(
      suggestChartType(
        table(
          nine,
          nine.map(() => 1),
        ),
        false,
      ),
    ).toBe('column');
  });

  it('suggests a line for dates and a scatter for numbers against numbers', () => {
    expect(suggestChartType(table(['1 Jan', '2 Jan'], [1, 2]), true)).toBe('line');
    expect(suggestChartType(table(['1', '2', '3'], [1, 2, 3], [4, 5, 6]), false)).toBe('scatter');
    // A header over a column of numbers makes them labels: still numbers against numbers.
    expect(suggestChartType(table(['1', '2', '5'], [40, null, 61]), false)).toBe('scatter');
  });
});

describe('a new chart', () => {
  it('reads its pick at Google size, anchored where it is told', () => {
    const range = { r1: 'r0000', c1: 'c0000', r2: 'r0003', c2: 'c0001' };
    const at = { r: 'r0000', c: 'c0002', dx: 0, dy: 0 };
    expect(newSheetChart('chart1', 'pie', { range }, at)).toEqual({
      id: 'chart1',
      kind: 'chart',
      at,
      width: 420,
      height: 280,
      type: 'pie',
      range,
    });
    expect(newSheetChart('chart1', 'pie', { range, cols: ['c0001'] }, at).cols).toEqual(['c0001']);
  });

  it('knows a first column of dates, under a header or not', () => {
    const json = (nf?: 'date'): SheetJson => ({
      id: 'sheetAAAA',
      tabId: 't1',
      title: 'S',
      layout: { rows: layout.rows.slice(0, 3), cols: layout.cols.slice(0, 2) },
      cells: [
        { r: 'r0000', c: 'c0000', i: { s: 'Day' } },
        { r: 'r0001', c: 'c0000', i: { n: 46024 }, ...(nf ? { f: { nf } } : {}) },
        { r: 'r0001', c: 'c0001', i: { n: 3 } },
      ],
      rev: 0,
      createdAt: 0,
      updatedAt: 0,
      updatedBy: { id: 'p', name: 'P', color: '#000000' },
    });
    const range = { r1: 'r0000', c1: 'c0000', r2: 'r0002', c2: 'c0001' };
    expect(labelsAreDates(sheetFromJson(json()), { range })).toBe(false);
    expect(labelsAreDates(sheetFromJson(json('date')), { range })).toBe(true);
  });
});
