// change_sheet's chart (docs/specs/029-sheets/sheet-store.md "Shaping a sheet"): a range in A1, some of its columns by
// letter, at a cell; refused in words.
import { describe, expect, it } from 'vitest';
import {
  NOBODY,
  Workbook,
  cellKey,
  emptyLayout,
  posRangeOf,
  templateTints,
  type Sheet,
  CellMap,
} from '@livedoc/sheets';
import {
  anchorAt,
  buildChartChange,
  paletteOfHeader,
  seriesNote,
  sheetChartElements,
  type SheetChartChange,
} from './sheet-charts';
import { seeded } from '../testing/sheets';

function book() {
  const rand = seeded(9);
  const layout = emptyLayout(rand, 20, 8);
  const sheet: Sheet = {
    id: 'sheet_chart1',
    tabId: 'tab',
    title: 'C',
    layout: {
      ...layout,
      colSize: { [layout.cols[0]!]: 200 },
      hiddenRows: [layout.rows[1]!],
      hiddenCols: [layout.cols[6]!],
    },
    cells: new CellMap(),
    rev: 0,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: NOBODY,
  };
  return { sheet, wb: new Workbook({ sheets: [sheet], locale: 'en-GB' }) };
}

const run = (change: Omit<SheetChartChange, 'op'>) => {
  const { wb, sheet } = book();
  return { built: buildChartChange(wb, sheet.id, { op: 'chart', ...change }), sheet };
};

describe('a chart over cells', () => {
  it('reads its range and columns, at the cell right of it by default, sized within bounds', () => {
    const { built, sheet } = run({
      type: 'pie',
      range: 'A4:C9',
      columns: ['a', 'C'],
      width: 50,
      height: 300.4,
    });
    if (!built.ok) throw new Error(built.message);
    expect(built.line).toBe('charted A4:C9 as a pie chart at the cell right of it');
    const [chart] = built.charts;
    expect(posRangeOf(sheet.layout, chart!.range)).toEqual({ r1: 3, c1: 0, r2: 8, c2: 2 });
    expect(chart!.cols).toEqual([sheet.layout.cols[0], sheet.layout.cols[2]]);
    // E4: past A (200 px) and B to D (120 each); rows 1 and 3 above it (row 2 hidden).
    expect(chart!.anchor).toEqual({ x: 200 + 3 * 120, y: 2 * 28 });
    expect(chart).toMatchObject({ width: 160, height: 300 });
  });

  it('is refused for a range it cannot chart, a column outside it, or a cell it cannot read', () => {
    const code = (change: Omit<SheetChartChange, 'op'>) => {
      const { built } = run(change);
      return built.ok ? null : built.message;
    };
    expect(code({ type: 'bar', range: 'nope' })).toMatch(/is not a range of the sheet/);
    expect(code({ type: 'bar', range: 'A1:Z5' })).toMatch(/is not a range of the sheet/);
    expect(code({ type: 'bar', range: 'A4:C4' })).toBe(
      'A chart reads a header row and at least one row of data.',
    );
    expect(code({ type: 'bar', range: 'A4:C9', columns: ['F'] })).toBe(
      'Column "F" is not a column of A4:C9.',
    );
    expect(code({ type: 'bar', range: 'A4:C9', at: '?' })).toBe(
      '"?" is not a cell in A1 form ("H4").',
    );
  });

  it('anchors at A1 with nothing before it, and passes hidden columns by', () => {
    expect(anchorAt(book().sheet.layout, [0, 0])).toEqual({ x: 0, y: 0 });
    // Rows before it at their own sizes, or at the heights they are drawn at (sheet.md "Row height"); row 2 is hidden.
    expect(anchorAt(book().sheet.layout, [1, 0]).y).toBeGreaterThan(0);
    expect(anchorAt(book().sheet.layout, [3, 0], () => 40).y).toBe(80);
    // A at 200, B to F at 120 each, G hidden.
    expect(anchorAt(book().sheet.layout, [0, 7]).x).toBe(200 + 5 * 120);
  });
});

describe('a chart’s colours and series', () => {
  it('takes the palette of its table’s header, or the one given', () => {
    const { wb, sheet } = book();
    const head = templateTints('emerald', false).head;
    const { rows, cols } = sheet.layout;
    sheet.cells.set(cellKey(rows[3]!, cols[0]!), { input: { s: 'Item' }, format: { bg: head } });
    sheet.cells.set(cellKey(rows[3]!, cols[1]!), { input: { s: 'Planned' } });
    sheet.cells.set(cellKey(rows[3]!, cols[2]!), { input: { s: 'Actual' } });
    wb.updateSheet({ ...sheet });
    const built = buildChartChange(wb, sheet.id, { op: 'chart', type: 'pie', range: 'A4:C9' });
    if (!built.ok) throw new Error(built.message);
    expect(built.charts[0]!.palette).toBe('forest');
    expect(built.line).toBe(
      'charted A4:C9 as a pie chart at the cell right of it (a pie chart shows one series, Planned; column, bar, line and area charts show all 2)',
    );
    // A column chart draws every series (D281), in the vivid default, whose colours tell apart.
    const columns = buildChartChange(wb, sheet.id, { op: 'chart', type: 'column', range: 'A4:C9' });
    expect(columns.ok && columns.charts[0]!.palette).toBeUndefined();
    expect(columns.ok && columns.line).toBe(
      'charted A4:C9 as a column chart at the cell right of it',
    );
    const given = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'line',
      range: 'A4:C9',
      palette: 'sunset',
    });
    expect(given.ok && given.charts[0]!.palette).toBe('sunset');
    // Unnamed value columns go by their letters; a plain header takes no palette.
    const plain = buildChartChange(wb, sheet.id, { op: 'chart', type: 'pie', range: 'D4:F9' });
    expect(plain.ok && plain.charts[0]!.palette).toBeUndefined();
    expect(plain.ok && plain.line).toContain('one series, E;');
  });

  it('knows each accent’s header on either canvas, and notes only one-series types given several', () => {
    expect(paletteOfHeader(templateTints('violet', true).head)).toBe('berry');
    expect(paletteOfHeader('#123456')).toBeUndefined();
    expect(paletteOfHeader(undefined)).toBeUndefined();
    expect(seriesNote('line', ['a', 'b'])).toBe('');
    expect(seriesNote('bar', ['a'])).toBe('');
  });
});

describe('chart elements', () => {
  it('take no palette of their own when given none, drawing in the default', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, { op: 'chart', type: 'pie', range: 'A1:B3' });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'pie-chart', chartSource: { sheetId: sheet.id } });
    expect(el!.chartPalette).toBeUndefined();
  });

  it('type a combo chart’s series and put one on the right axis, by name (Combo, D286)', () => {
    const { wb, sheet } = book();
    const { rows, cols } = sheet.layout;
    ['Q', 'Visits', 'Rate'].forEach((s, c) =>
      sheet.cells.set(cellKey(rows[0]!, cols[c]!), { input: { s } }),
    );
    wb.updateSheet({ ...sheet });
    const built = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'combo',
      range: 'A1:C3',
      seriesTypes: { visits: 'area' },
      rightAxis: ['RATE'],
    });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'line-chart', chartVariant: 'combo' });
    expect(el!.lineSeries!.map((s) => [s.name, s.type, s.axis])).toEqual([
      ['Visits', 'area', undefined],
      ['Rate', undefined, 'right'],
    ]);
  });

  it('draw a stepped area chart, and a combo chart’s stepped area series, its right axis too (D289)', () => {
    const { wb, sheet } = book();
    const { rows, cols } = sheet.layout;
    ['Q', 'Visits', 'Rate'].forEach((s, c) =>
      sheet.cells.set(cellKey(rows[0]!, cols[c]!), { input: { s } }),
    );
    wb.updateSheet({ ...sheet });
    const built = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'stepped-area',
      range: 'A1:C3',
      rightAxis: ['Rate'],
    });
    if (!built.ok) throw new Error(built.message);
    const combo = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'combo',
      range: 'A1:C3',
      seriesTypes: { Rate: 'stepped-area' },
    });
    if (!combo.ok) throw new Error(combo.message);
    const [steps, mixed] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      [...built.charts, ...combo.charts],
    );
    expect(steps).toMatchObject({ shape: 'line-chart', chartVariant: 'stepped-area' });
    expect(steps!.lineSeries!.map((s) => s.axis)).toEqual([undefined, 'right']);
    expect(mixed!.lineSeries!.map((s) => s.type)).toEqual([undefined, 'stepped-area']);
  });

  it('draw candlestick and OHLC charts (D322)', () => {
    const { wb, sheet } = book();
    for (const type of ['candlestick', 'ohlc'] as const) {
      const built = buildChartChange(wb, sheet.id, { op: 'chart', type, range: 'A1:E6' });
      if (!built.ok) throw new Error(built.message);
      const [el] = sheetChartElements(
        wb,
        { x: 0, y: 0, width: 960, height: 560 },
        sheet.id,
        built.charts,
      );
      expect(el).toMatchObject({ shape: 'line-chart', chartVariant: type });
    }
  });

  it('draw a histogram, its value columns the values it counts (D324)', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'histogram',
      range: 'A1:C3',
    });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'line-chart', chartVariant: 'histogram' });
    expect(el!.lineSeries!.length).toBeGreaterThan(0);
  });

  it('draw a timeline (D347)', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, { op: 'chart', type: 'timeline', range: 'A1:B3' });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'line-chart', chartVariant: 'timeline' });
  });

  it('draw a scorecard (D345)', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'scorecard',
      range: 'A1:C3',
    });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'line-chart', chartVariant: 'scorecard' });
    expect(el!.lineSeries!.length).toBeGreaterThan(0);
  });

  it('draw a gauge (D330)', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, { op: 'chart', type: 'gauge', range: 'A1:B3' });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'pie-chart', chartVariant: 'gauge' });
  });

  it('draw a treemap (D328)', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, { op: 'chart', type: 'treemap', range: 'A1:B3' });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'pie-chart', chartVariant: 'treemap' });
  });

  it('draw a waterfall (D326)', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'waterfall',
      range: 'A1:B3',
    });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'line-chart', chartVariant: 'waterfall' });
  });

  it('draw a bubble chart, which joins no lines (D320)', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, { op: 'chart', type: 'bubble', range: 'A1:C3' });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'line-chart', chartVariant: 'bubble' });
    const refused = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'bubble',
      range: 'A1:C3',
      lines: ['B'],
    });
    expect(refused.ok).toBe(false);
  });

  it('draw a radar chart, which takes no right-hand axis (D291)', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, { op: 'chart', type: 'radar', range: 'A1:B3' });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({ shape: 'line-chart', chartVariant: 'radar' });
    const refused = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'radar',
      range: 'A1:B3',
      rightAxis: ['B'],
    });
    expect(refused.ok).toBe(false);
  });

  // sheet-store.md "Built for agents in a spreadsheet": the title options draw on a Plan chart too.
  it('carry the titles, the legend, the values, the axis and the stacking an agent gives', () => {
    const { wb, sheet } = book();
    const built = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'line',
      range: 'A1:B3',
      title: 'Sales',
      xAxisTitle: 'Month',
      yAxisTitle: 'EUR',
      legend: 'none',
      values: true,
      axis: true,
      stack: 'stacked',
      smooth: true,
    });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el).toMatchObject({
      chartTitle: 'Sales',
      chartAxisTitles: { x: 'Month', y: 'EUR' },
      chartLegend: false,
      chartValues: true,
      chartAxis: true,
      chartStack: 'stacked',
      chartSmooth: true,
    });
  });

  it('refuse a title or alt text past its length', () => {
    expect(run({ type: 'line', range: 'A1:B3', title: 'x'.repeat(201) }).built).toMatchObject({
      ok: false,
      code: 'write_invalid',
    });
    expect(run({ type: 'line', range: 'A1:B3', alt: 'x'.repeat(1001) }).built).toMatchObject({
      ok: false,
      code: 'write_invalid',
    });
  });
});

// pie-chart.md "Lines set by an agent": `lines` names the series of a scatter chart drawn as lines, by header.
describe('a scatter chart’s lines', () => {
  function frontier() {
    const { wb, sheet } = book();
    const { rows, cols } = sheet.layout;
    const put = (r: number, c: number, input: { s: string } | { n: number }) =>
      sheet.cells.set(cellKey(rows[r]!, cols[c]!), { input });
    // Below the fixture's hidden row 2.
    put(2, 0, { s: 'Cost' });
    put(2, 1, { s: 'Models' });
    put(2, 2, { s: 'Pareto' });
    [
      [0.5, 70, 70],
      [1.5, 60, Number.NaN],
      [4, 90, 90],
    ].forEach(([x, m, p], i) => {
      put(i + 3, 0, { n: x! });
      put(i + 3, 1, { n: m! });
      if (!Number.isNaN(p)) put(i + 3, 2, { n: p! });
    });
    wb.updateSheet({ ...sheet });
    return { wb, sheet };
  }

  it('marks the named series as a line, any case, the others points', () => {
    const { wb, sheet } = frontier();
    const built = buildChartChange(wb, sheet.id, {
      op: 'chart',
      type: 'scatter',
      range: 'A3:C6',
      lines: ['pareto'],
    });
    if (!built.ok) throw new Error(built.message);
    const [el] = sheetChartElements(
      wb,
      { x: 0, y: 0, width: 960, height: 560 },
      sheet.id,
      built.charts,
    );
    expect(el!.lineSeries!.map((s) => [s.name, s.line === true])).toEqual([
      ['Models', false],
      ['Pareto', true],
    ]);
    // The empty cell is no value; the line joins the present points.
    expect(el!.lineSeries![1]!.values).toEqual([70, null, 90]);
  });

  it('is refused for a name that is no series, or on another chart type, writing nothing', () => {
    const { wb, sheet } = frontier();
    const message = (change: Omit<SheetChartChange, 'op'>) => {
      const built = buildChartChange(wb, sheet.id, { op: 'chart', ...change });
      return built.ok ? null : built.message;
    };
    expect(message({ type: 'scatter', range: 'A3:C6', lines: ['Frontier'] })).toBe(
      '"Frontier" is no series of the chart. Its series: Models, Pareto.',
    );
    expect(message({ type: 'line', range: 'A3:C6', lines: ['Pareto'] })).toBe(
      'lines draw on a scatter chart; a line chart draws every series as a line already.',
    );
    expect(message({ type: 'column', range: 'A3:C6', lines: ['Pareto'] })).toBe(
      'lines draw on a scatter chart; a column chart draws no lines.',
    );
    // Only the picked columns' series are named.
    expect(
      message({ type: 'scatter', range: 'A3:C6', columns: ['A', 'B'], lines: ['Pareto'] }),
    ).toBe('"Pareto" is no series of the chart. Its series: Models.');
  });
});
