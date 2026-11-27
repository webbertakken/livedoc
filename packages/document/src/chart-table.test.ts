// docs/specs/009-elements/pie-chart.md "Chart types", "Table" (D374): the chart's data written as a table, a header
// row of the series, a row per category, values right-aligned, a faint band on every second row, rows past the plot
// counted in the last.
import { describe, expect, it } from 'vitest';
import { fitText, isTableChart, tableMarks, TABLE_BAND } from './chart-table';
import { chartShapeOf, chartTypeOf, CHART_TYPE_LABELS } from './chart-types';
import type { LineSeries } from './data-shapes';
import type { ShapeElement } from './index';
import { renderElementsToSvg } from './index';
import { createShape } from './shape-factory';

const AREA = { x: 10, y: 20, w: 400, h: 200 };
const S = (name: string, values: (number | null)[]): LineSeries => ({ name, values });
const CATS = ['North', 'South', 'East'];
const SALES = [S('Sales', [1200.5, 980, null]), S('Costs', [400, 410, 395])];
const texts = (cells: readonly { text: string }[]) => cells.map((c) => c.text);

describe('table as a chart type', () => {
  it('is a line chart kind with its own variant, named Table', () => {
    expect(chartShapeOf('table')).toEqual({ shape: 'line-chart', chartVariant: 'table' });
    expect(chartTypeOf({ shape: 'line-chart', chartVariant: 'table' })).toBe('table');
    expect(isTableChart({ shape: 'line-chart', chartVariant: 'table' })).toBe(true);
    expect(isTableChart({ shape: 'line-chart' })).toBe(false);
    expect(CHART_TYPE_LABELS.table).toBe('Table');
  });
});

describe('fitText', () => {
  it('keeps text that fits and cuts what does not with an ellipsis', () => {
    expect(fitText('North', 200, 10)).toBe('North');
    const cut = fitText('A region with a very long name', 60, 10);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan(20);
    expect(fitText('Wide', 1, 10)).toBe('…');
  });
});

describe('tableMarks', () => {
  it('writes a header of the series, then a row per category, an empty cell for no value', () => {
    const m = tableMarks(AREA, CATS, SALES, 'Region');
    expect(texts(m.header)).toEqual(['Region', 'Sales', 'Costs']);
    expect(m.rows.map(texts)).toEqual([
      ['North', '1,200.5', '400'],
      ['South', '980', '410'],
      ['East', '', '395'],
    ]);
    expect(m.rows[0]![0]!.anchor).toBe('start');
    expect(m.rows[0]![1]!.anchor).toBe('end');
    expect(m.rows[1]![0]!.y).toBe(m.rows[0]![0]!.y + m.rowH);
    expect(m.rule.y).toBe(AREA.y + m.rowH);
    // Every second data row is banded.
    expect(m.bands).toEqual([{ x: AREA.x, y: AREA.y + 2 * m.rowH, w: AREA.w, h: m.rowH }]);
  });

  it('shares the width by the longest text, the first column at least a quarter of it', () => {
    const m = tableMarks(AREA, ['A', 'B'], [S('A rather long series name', [1, 2])], '');
    // The value column ends at the right edge, padded; the first column takes its floor.
    expect(m.header[1]!.x).toBe(AREA.x + AREA.w - 6);
    expect(m.rows[0]![0]!.x).toBe(AREA.x + 6);
    const second = m.header[1]!;
    expect(second.anchor).toBe('end');
    const wide = tableMarks(AREA, ['A category name that runs on'], [S('S', [1])], '');
    expect(wide.rows[0]![0]!.text).toBe('A category name that runs on');
  });

  it('counts the rows that do not fit in the last one that does', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Row ${i + 1}`);
    const m = tableMarks(
      AREA,
      many,
      [
        S(
          'V',
          many.map((_, i) => i),
        ),
      ],
      '',
      0,
      0,
      10,
    );
    // 18 px rows: a header and ten rows fit in 200 px; nine are data, the tenth counts the other 21.
    expect(m.rowH).toBe(18);
    expect(m.rows).toHaveLength(10);
    expect(texts(m.rows[9]!)).toEqual(['+ 21 more rows']);
    const one = tableMarks(
      { ...AREA, h: 18 * 4 },
      ['a', 'b', 'c', 'd'],
      [S('V', [1, 2, 3, 4])],
      '',
      0,
      0,
      10,
    );
    expect(texts(one.rows.at(-1)!)).toEqual(['+ 2 more rows']);
    const just = tableMarks(
      { ...AREA, h: 18 * 4 },
      ['a', 'b', 'c'],
      [S('V', [1, 2, 3])],
      '',
      0,
      0,
      10,
    );
    expect(just.rows).toHaveLength(3);
    const single = tableMarks(
      { ...AREA, h: 18 * 3 },
      ['a', 'b', 'c'],
      [S('V', [1, 2, 3])],
      '',
      0,
      0,
      10,
    );
    expect(texts(single.rows.at(-1)!)).toEqual(['+ 2 more rows']);
    const last = tableMarks({ ...AREA, h: 18 * 3 + 1 }, ['a', 'b'], [S('V', [1, 2])], '', 0, 0, 10);
    expect(last.rows).toHaveLength(2);
    const lone = tableMarks({ ...AREA, h: 18 * 2 }, ['a', 'b'], [S('V', [1, 2])], '', 0, 0, 10);
    expect(texts(lone.rows[0]!)).toEqual(['+ 2 more rows']);
    const oneMore = tableMarks(
      { ...AREA, h: 18 * 3 },
      ['a', 'b', 'c'],
      [S('V', [1, 2, 3])],
      '',
      0,
      0,
      10,
    );
    expect(oneMore.rows).toHaveLength(2);
  });

  it('writes the header alone with no room for a row, and the default data with none', () => {
    const none = tableMarks({ ...AREA, h: 20 }, CATS, SALES, '', 0, 0, 10);
    expect(none.rows).toEqual([]);
    expect(texts(none.header)).toEqual(['', 'Sales', 'Costs']);
    const bare = tableMarks(AREA, [], [], '');
    expect(bare.rows.length).toBeGreaterThan(0);
    expect(bare.header.length).toBeGreaterThan(1);
  });

  it('shifts by the origin', () => {
    const a = tableMarks(AREA, CATS, SALES, '');
    const b = tableMarks(AREA, CATS, SALES, '', 5, 7);
    expect(b.rows[0]![0]!.x - a.rows[0]![0]!.x).toBe(5);
    expect(b.rows[0]![0]!.y - a.rows[0]![0]!.y).toBe(7);
  });
});

describe('the table in the export', () => {
  it('draws its header, its cells and its bands, and no legend', () => {
    const el: ShapeElement = {
      ...createShape('line-chart', 0, 0),
      width: 400,
      height: 240,
      chartVariant: 'table',
      chartAxisTitles: { x: 'Region' },
      lineCategories: CATS,
      lineSeries: SALES,
    };
    const svg = renderElementsToSvg({ id: 't', name: 'T', elements: [el] }, {});
    // The axis title heads the first column, once.
    expect(svg.split('>Region</text>')).toHaveLength(2);
    expect(svg).toContain('>1,200.5</text>');
    expect(svg).toContain(`fill="${TABLE_BAND}"`);
    expect(svg).toContain('font-weight="600"');
    const bare = {
      ...el,
      chartAxisTitles: undefined,
      lineSeries: undefined,
      lineCategories: undefined,
    };
    expect(renderElementsToSvg({ id: 't', name: 'T', elements: [bare] }, {})).toContain('<text');
  });
});
