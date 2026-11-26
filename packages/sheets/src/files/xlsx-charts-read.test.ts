// docs/specs/029-sheets/standard-mapping.md "Charts in the file", Reading (D275, D276): an XLSX sheet's drawing of
// charts that qualify becomes its own charts, each keeping its file XML while it sums as it was read; any other
// drawing stays kept whole.
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { AGENT_LOCALE, writeRows } from '../a1-io';
import { Workbook } from '../engine/workbook';
import type { SheetChart } from '../objects/sheet-objects';
import { applySheetWrite } from '../store';
import { emptyLayout, emptySheet, NOBODY, type Sheet } from '../sheet';
import { fileChartsOf, fileChartSum } from './file-charts';
import type { FileAt, KeptContent } from './kept-content';
import { sheetsFromFile, type FileSheet, type WorkbookFile } from './workbook-file';
import { parseXlsxRef, readXlsxChartXml, readXlsxCharts } from './xlsx-charts-read';
import { xlsxChartXml } from './xlsx-charts';
import { readXlsx } from './xlsx-read';
import { writeXlsx } from './xlsx-write';

function seeded(seed = 5): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function models(): Sheet {
  const rand = seeded();
  const blank = emptySheet({
    id: 'sheet_m1',
    tabId: 't',
    title: 'Models',
    layout: emptyLayout(rand, 20, 8),
  });
  const made = writeRows(
    new Workbook({ sheets: [blank], locale: AGENT_LOCALE }),
    'sheet_m1',
    'A1',
    [
      ['Model', 'Cost', 'Index', 'Pareto'],
      ['Opus', 15, 60, 60],
      ['Sonnet', 3, 54, 54],
      ['Haiku', 1, null, null],
    ],
    rand,
  );
  if (!made.ok) throw new Error(made.error);
  return applySheetWrite(blank, made.write, { now: 0, by: NOBODY }).sheet;
}

function chartOn(sheet: Sheet, extra: Partial<SheetChart> = {}): Sheet {
  const { rows, cols } = sheet.layout;
  const chart: SheetChart = {
    id: 'chart1',
    kind: 'chart',
    type: 'scatter',
    at: { r: rows[5]!, c: cols[5]!, dx: 4, dy: 2 },
    width: 420,
    height: 280,
    range: { r1: rows[0]!, c1: cols[1]!, r2: rows[3]!, c2: cols[3]! },
    legend: 'none',
    axis: false,
    values: true,
    title: 'Coding value',
    xTitle: 'Cost',
    yTitle: 'Index',
    alt: 'Cost against index',
    series: { [cols[3]!]: { line: true, color: '#aa3300' }, [cols[2]!]: { color: '#0055cc' } },
    ...extra,
  };
  return { ...sheet, layout: { ...sheet.layout, objects: [chart] } };
}

const fileOf = (sheet: Sheet): WorkbookFile => {
  const engine = new Workbook({ sheets: [sheet], locale: AGENT_LOCALE });
  return {
    sheets: [
      {
        name: sheet.title,
        rows: 20,
        cols: 8,
        cells: [],
        charts: fileChartsOf(engine, sheet, AGENT_LOCALE),
      },
    ],
  };
};

async function entries(bytes: Uint8Array): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const listed = listZip(new Uint8Array(bytes));
  if (!listed.ok) throw new Error('zip');
  for (const entry of listed.entries) {
    const read = await readZipEntry(new Uint8Array(bytes), entry, new ByteBudget(50_000_000));
    if (read.ok) out.set(entry.name, new TextDecoder().decode(read.bytes));
  }
  return out;
}

describe('reading XLSX charts', () => {
  it('reads a chart it wrote back to the same chart, keeping its XML', async () => {
    const sheet = chartOn(models());
    const written = writeXlsx(fileOf(sheet), 'charts');
    const read = await readXlsx(written.data);
    if (!read.ok) throw new Error(read.rejection);
    const [charted] = read.file.sheets;
    expect(charted!.charts).toHaveLength(1);
    const [chart] = charted!.charts!;
    const [want] = fileOf(sheet).sheets[0]!.charts!;
    expect(chart!.kept).toEqual({ part: 'xl/charts/chart1.xml', sum: fileChartSum(want!) });
    // Nothing of the drawing is kept beside it.
    expect(read.file.kept?.items.some((i) => /drawing/.test(i.xml))).toBe(false);
    expect(read.file.kept?.parts.map((p) => p.name)).toEqual(['xl/charts/chart1.xml']);
    const made = sheetsFromFile(read.file, AGENT_LOCALE, seeded(9));
    const object = made.sheets[0]!.layout.objects![0]!;
    const { rows, cols } = made.sheets[0]!.layout;
    expect(object).toEqual({
      id: expect.stringMatching(/^[a-z0-9]{6}$/),
      kind: 'chart',
      type: 'scatter',
      at: { r: rows[5], c: cols[5], dx: 4, dy: 2 },
      width: 420,
      height: 280,
      range: { r1: rows[0], c1: cols[1], r2: rows[3], c2: cols[3] },
      legend: 'none',
      axis: false,
      values: true,
      title: 'Coding value',
      xTitle: 'Cost',
      yTitle: 'Index',
      alt: 'Cost against index',
      series: { [cols[3]!]: { color: '#aa3300', line: true }, [cols[2]!]: { color: '#0055cc' } },
      kept: chart!.kept,
    });
  });

  it('writes the kept XML while the chart sums the same, and anew, named, once it changed', async () => {
    const written = writeXlsx(fileOf(chartOn(models())), 'charts');
    const original = (await entries(written.data)).get('xl/charts/chart1.xml')!;
    // A kept chart's XML, marked so its use shows.
    const marked = original.replace(
      '<c:roundedCorners val="0"/>',
      '<c:roundedCorners val="0"/><c:style val="2"/>',
    );
    const read = await readXlsx(written.data);
    if (!read.ok) throw new Error(read.rejection);
    const file: WorkbookFile = {
      ...read.file,
      kept: {
        ...read.file.kept!,
        parts: read.file.kept!.parts.map((p) => ({ ...p, data: new TextEncoder().encode(marked) })),
      },
    };
    const again = writeXlsx(file, 'again');
    expect(again.losses).toEqual([]);
    expect((await entries(again.data)).get('xl/charts/chart1.xml')).toBe(marked);
    const sheet = file.sheets[0]!;
    const changed = writeXlsx(
      { ...file, sheets: [{ ...sheet, charts: [{ ...sheet.charts![0]!, title: 'New' }] }] },
      'changed',
    );
    expect(changed.losses).toEqual([{ k: 'chart_rewritten', sheet: 'Models' }]);
    const chartXml = [...(await entries(changed.data)).entries()].find(([n]) =>
      /^xl\/charts\/chart\d+\.xml$/.test(n),
    )![1];
    expect(chartXml).toContain('<a:t>New</a:t>');
    expect(chartXml).not.toContain('c:style');
  });

  it('reads a column chart Excel anchors over two cells, names from a header, its labels by column', () => {
    const xml = xlsxChartXml('Q 1', {
      id: 'x',
      type: 'column',
      legend: 'right',
      values: false,
      axis: true,
      at: { r: 0, c: 0, dx: 0, dy: 0 },
      width: 400,
      height: 300,
      labels: { range: { r1: 1, c1: 0, r2: 3, c2: 0 }, cached: ['a', 'b', 'c'] },
      x: null,
      series: [
        {
          name: 'Cost',
          nameAt: { r: 0, c: 1 },
          values: { r1: 1, c1: 1, r2: 3, c2: 1 },
          cached: [1, 2, 3],
        },
        {
          name: 'Gain',
          nameAt: { r: 0, c: 3 },
          values: { r1: 1, c1: 3, r2: 3, c2: 3 },
          cached: [1, 2, 3],
        },
      ],
    });
    const read = readXlsxChartXml(xml, 'q 1');
    expect(read).toMatchObject({
      type: 'column',
      legend: 'right',
      labels: { range: { r1: 1, c1: 0, r2: 3, c2: 0 } },
      series: [{ name: 'Cost', nameAt: { r: 0, c: 1 } }, { nameAt: { r: 0, c: 3 } }],
    });
    const drawing = `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>95250</xdr:rowOff></xdr:from><xdr:to><xdr:col>8</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>12</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
    const sheet: FileSheet = {
      name: 'Q 1',
      rows: 20,
      cols: 10,
      cells: [],
      lines: { c: { lines: new Map([[6, { size: 200 }]]), collapsed: [] } },
    };
    const out = readXlsxCharts([sheet], keptWith(drawing, xml));
    const [chart] = out.sheets[0]!.charts!;
    // Columns F, G (200 px) and H of 120 px; rows 3 to 12 of 28 px, less the 10 px into the first.
    expect(chart).toMatchObject({ at: { r: 2, c: 5, dx: 0, dy: 10 }, width: 440, height: 270 });
    expect(chart!.alt).toBeUndefined();
    expect(out.kept!.items).toEqual([]);
    expect(out.kept!.relationships).toEqual([]);
  });
});

const C =
  'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const ser = (body: string) => `<c:ser><c:idx val="0"/><c:order val="0"/>${body}</c:ser>`;
const valRef = (f: string) => `<c:val><c:numRef><c:f>${f}</c:f></c:numRef></c:val>`;
const chartXml = (plot: string) =>
  `<c:chartSpace ${C}><c:chart><c:plotArea>${plot}</c:plotArea></c:chart></c:chartSpace>`;
const DRAWING = (anchor: string) =>
  `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchor}</xdr:wsDr>`;
const ONE_CELL = DRAWING(
  `<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="3810000" cy="2857500"/><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="c" descr="Alt text"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:oneCellAnchor>`,
);

function keptWith(drawing: string, chart: string): KeptContent<FileAt> {
  const enc = (s: string) => new TextEncoder().encode(s);
  return {
    standard: 'ooxml',
    items: [{ place: 'worksheet', xml: '<drawing r:id="rId9"/>', ns: {}, at: { sheet: 0 } }],
    relationships: [
      {
        from: 'sheet',
        at: { sheet: 0 },
        id: 'rId9',
        type: 'drawing',
        target: '/xl/drawings/drawing1.xml',
      },
    ],
    parts: [
      {
        name: 'xl/drawings/drawing1.xml',
        type: 'drawing',
        data: enc(drawing),
        rels: [{ id: 'rId1', type: 'chart', target: '../charts/chart1.xml' }],
      },
      { name: 'xl/charts/chart1.xml', type: 'chart', data: enc(chart), rels: [] },
    ],
  };
}

const sheetQ: FileSheet = { name: 'Q', rows: 20, cols: 10, cells: [] };

describe('what is not read (D275)', () => {
  const good = chartXml(`<c:lineChart>${ser(valRef('Q!$B$2:$B$4'))}</c:lineChart>`);

  it('reads a plain line chart with its alt text and a one-cell anchor, legend none', () => {
    const out = readXlsxCharts([sheetQ], keptWith(ONE_CELL, good));
    expect(out.sheets[0]!.charts![0]).toMatchObject({
      type: 'line',
      legend: 'none',
      alt: 'Alt text',
      at: { r: 1, c: 1 },
      width: 400,
      height: 300,
    });
  });

  it.each([
    [
      'a bar of another grouping',
      `<c:barChart><c:grouping val="sideways"/>${ser(valRef('Q!$B$2:$B$4'))}</c:barChart>`,
    ],
    [
      'an area of another grouping',
      `<c:areaChart><c:grouping val="clustered"/>${ser(valRef('Q!$B$2:$B$4'))}</c:areaChart>`,
    ],
    [
      'a stacked line',
      `<c:lineChart><c:grouping val="stacked"/>${ser(valRef('Q!$B$2:$B$4'))}</c:lineChart>`,
    ],
    ['no chart group', ''],
    [
      'bars on their side beside a line',
      `<c:barChart><c:barDir val="bar"/>${ser(valRef('Q!$B$2:$B$4'))}</c:barChart><c:lineChart>${ser(valRef('Q!$C$2:$C$4'))}</c:lineChart>`,
    ],
    [
      'stacked columns beside a line',
      `<c:barChart><c:grouping val="stacked"/>${ser(valRef('Q!$B$2:$B$4'))}</c:barChart><c:lineChart>${ser(valRef('Q!$C$2:$C$4'))}</c:lineChart>`,
    ],
    [
      'two line groups',
      `<c:lineChart>${ser(valRef('Q!$B$2:$B$4'))}</c:lineChart><c:lineChart>${ser(valRef('Q!$C$2:$C$4'))}</c:lineChart>`,
    ],
    [
      'columns beside a scatter',
      `<c:barChart>${ser(valRef('Q!$B$2:$B$4'))}</c:barChart><c:scatterChart>${ser('<c:yVal><c:numRef><c:f>Q!$C$2:$C$4</c:f></c:numRef></c:yVal>')}</c:scatterChart>`,
    ],
    [
      'groups on axes of their own',
      `<c:barChart>${ser(valRef('Q!$B$2:$B$4'))}<c:axId val="1"/><c:axId val="2"/></c:barChart><c:lineChart>${ser(valRef('Q!$C$2:$C$4'))}<c:axId val="3"/><c:axId val="4"/></c:lineChart>`,
    ],
    [
      'four groups',
      `<c:barChart>${ser(valRef('Q!$B$2:$B$4'))}</c:barChart><c:lineChart>${ser(valRef('Q!$C$2:$C$4'))}</c:lineChart><c:areaChart>${ser(valRef('Q!$D$2:$D$4'))}</c:areaChart><c:pieChart>${ser(valRef('Q!$E$2:$E$4'))}</c:pieChart>`,
    ],
    [
      'a smooth area in a combo',
      `<c:barChart>${ser(valRef('Q!$B$2:$B$4'))}</c:barChart><c:areaChart>${ser(`${valRef('Q!$C$2:$C$4')}<c:smooth val="1"/>`)}</c:areaChart>`,
    ],
    ['a 3-D chart', `<c:bar3DChart>${ser(valRef('Q!$B$2:$B$4'))}</c:bar3DChart>`],
    [
      'a smooth scatter',
      `<c:scatterChart><c:scatterStyle val="smoothMarker"/>${ser('<c:yVal><c:numRef><c:f>Q!$B$2:$B$4</c:f></c:numRef></c:yVal>')}</c:scatterChart>`,
    ],
    [
      'a line smooth in one series of two',
      `<c:lineChart>${ser(`${valRef('Q!$B$2:$B$4')}<c:smooth val="1"/>`)}${ser(`${valRef('Q!$C$2:$C$4')}<c:smooth val="0"/>`)}</c:lineChart>`,
    ],
    [
      'a smooth scatter series',
      `<c:scatterChart>${ser(`<c:yVal><c:numRef><c:f>Q!$B$2:$B$4</c:f></c:numRef></c:yVal><c:smooth val="1"/>`)}</c:scatterChart>`,
    ],
    ['another sheet’s cells', `<c:lineChart>${ser(valRef('Other!$B$2:$B$4'))}</c:lineChart>`],
    ['a series over two columns', `<c:lineChart>${ser(valRef('Q!$B$2:$C$4'))}</c:lineChart>`],
    [
      'a name typed in',
      `<c:lineChart>${ser(`<c:tx><c:v>Typed</c:v></c:tx>${valRef('Q!$B$2:$B$4')}`)}</c:lineChart>`,
    ],
    [
      'series on other rows',
      `<c:lineChart>${ser(valRef('Q!$B$2:$B$4'))}${ser(valRef('Q!$C$3:$C$5'))}</c:lineChart>`,
    ],
    [
      'series out of column order',
      `<c:lineChart>${ser(valRef('Q!$C$2:$C$4'))}${ser(valRef('Q!$B$2:$B$4'))}</c:lineChart>`,
    ],
    [
      'one series named, one not',
      `<c:lineChart>${ser(`<c:tx><c:strRef><c:f>Q!$B$1</c:f></c:strRef></c:tx>${valRef('Q!$B$2:$B$4')}`)}${ser(valRef('Q!$C$2:$C$4'))}</c:lineChart>`,
    ],
    [
      'a name off its column',
      `<c:lineChart>${ser(`<c:tx><c:strRef><c:f>Q!$C$1</c:f></c:strRef></c:tx>${valRef('Q!$B$2:$B$4')}`)}</c:lineChart>`,
    ],
    [
      'labels differing per series',
      `<c:lineChart>${ser(`<c:cat><c:strRef><c:f>Q!$A$2:$A$4</c:f></c:strRef></c:cat>${valRef('Q!$B$2:$B$4')}`)}${ser(valRef('Q!$C$2:$C$4'))}</c:lineChart>`,
    ],
    [
      'labels on other rows',
      `<c:lineChart>${ser(`<c:cat><c:strRef><c:f>Q!$A$3:$A$5</c:f></c:strRef></c:cat>${valRef('Q!$B$2:$B$4')}`)}</c:lineChart>`,
    ],
    [
      'labels from another sheet',
      `<c:lineChart>${ser(`<c:cat><c:strRef><c:f>Other!$A$2:$A$4</c:f></c:strRef></c:cat>${valRef('Q!$B$2:$B$4')}`)}</c:lineChart>`,
    ],
    ['no series', '<c:lineChart></c:lineChart>'],
    ['a series axis', `<c:lineChart>${ser(valRef('Q!$B$2:$B$4'))}</c:lineChart><c:serAx/>`],
  ])('keeps the drawing of %s whole', (_, plot) => {
    const kept = keptWith(ONE_CELL, chartXml(plot));
    const out = readXlsxCharts([sheetQ], kept);
    expect(out.sheets[0]!.charts).toBeUndefined();
    expect(out.kept).toEqual(kept);
  });

  it('keeps a chart naming parts of its own, a damaged one, and a drawing holding anything else', () => {
    const own = good.replace('<c:chart>', '<c:chart><c:userShapes r:id="rId2"/>');
    for (const [drawing, chart] of [
      [ONE_CELL, own],
      [ONE_CELL, '<c:chartSpace'],
      [ONE_CELL.replaceAll('oneCellAnchor', 'absoluteAnchor'), good],
      [ONE_CELL.replace('<xdr:ext cx', '<xdr:extx cx').replace('<xdr:col>1', '<xdr:col>x'), good],
      [
        DRAWING(
          ONE_CELL.slice(
            ONE_CELL.indexOf('<xdr:oneCellAnchor>'),
            ONE_CELL.indexOf('</xdr:wsDr>'),
          ).replace('<xdr:graphicFrame', '<xdr:pic/><xdr:graphicFrameX'),
        ),
        good,
      ],
      ['<broken', good],
    ] as const) {
      const kept = keptWith(drawing, chart);
      expect(readXlsxCharts([sheetQ], kept).kept).toEqual(kept);
    }
    const twoCellNoTo = DRAWING(
      '<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from></xdr:twoCellAnchor>',
    );
    expect(readXlsxCharts([sheetQ], keptWith(twoCellNoTo, good)).sheets[0]!.charts).toBeUndefined();
  });

  it('reads a bare legend, values shown by default, a scatter of no style, a frame of no names', () => {
    const plot =
      '<c:scatterChart>' +
      ser(
        '<c:xVal><c:numRef><c:f>Q!$A$2:$A$4</c:f></c:numRef></c:xVal><c:yVal><c:numRef><c:f>Q!$B$2:$B$4</c:f></c:numRef></c:yVal>',
      ) +
      '<c:dLbls><c:showVal/></c:dLbls></c:scatterChart><c:valAx><c:axPos val="b"/></c:valAx><c:valAx><c:axPos val="l"/><c:delete/></c:valAx>';
    const xml = `<c:chartSpace ${C}><c:chart><c:plotArea>${plot}</c:plotArea><c:legend/></c:chart></c:chartSpace>`;
    const bare = ONE_CELL.replace(/<xdr:nvGraphicFramePr>.*<\/xdr:nvGraphicFramePr>/, '');
    expect(readXlsxCharts([sheetQ], keptWith(bare, xml)).sheets[0]!.charts![0]).toMatchObject({
      type: 'scatter',
      legend: 'right',
      values: true,
      axis: false,
      x: { range: { r1: 1, c1: 0, r2: 3, c2: 0 } },
    });
    for (const drawing of [
      DRAWING(''),
      ONE_CELL.replace(/<xdr:ext [^>]*\/>/, ''),
      ONE_CELL.replace('<xdr:oneCellAnchor>', '<xdr:twoCellAnchor>').replace(
        '</xdr:oneCellAnchor>',
        '</xdr:twoCellAnchor>',
      ),
      ONE_CELL.replace('<xdr:colOff>0</xdr:colOff>', ''),
    ])
      expect(readXlsxCharts([sheetQ], keptWith(drawing, xml)).sheets[0]!.charts).toBeUndefined();
  });

  it('reads nothing without kept content, or a sheet without a drawing', () => {
    expect(readXlsxCharts([sheetQ], undefined)).toEqual({ sheets: [sheetQ], kept: undefined });
    const kept = { ...keptWith(ONE_CELL, good), items: [] };
    expect(readXlsxCharts([sheetQ], kept).sheets[0]).toBe(sheetQ);
  });
});

describe('parseXlsxRef', () => {
  it('reads a quoted or bare sheet and a cell or block, in order', () => {
    expect(parseXlsxRef("'It''s'!$C$4:$A$1")).toEqual({
      sheet: "It's",
      range: { r1: 0, c1: 0, r2: 3, c2: 2 },
    });
    expect(parseXlsxRef('Q!B2')).toEqual({ sheet: 'Q', range: { r1: 1, c1: 1, r2: 1, c2: 1 } });
    expect(parseXlsxRef('B2')).toBeNull();
  });
});

// Every type the writer writes reads back to the chart it wrote: the same sum (D276).
describe('a written chart, read', () => {
  const base = {
    id: 'x',
    legend: 'top' as const,
    values: true,
    axis: false,
    at: { r: 0, c: 0, dx: 0, dy: 0 },
    width: 400,
    height: 300,
    title: 'T',
    xTitle: 'X',
    yTitle: 'Y',
  };
  const cell = (c: number) => ({ r1: 1, c1: c, r2: 4, c2: c });
  it.each(['column', 'bar', 'line', 'area', 'pie', 'doughnut'] as const)('reads %s', (type) => {
    const round = type === 'pie' || type === 'doughnut';
    // A round chart has no axes to write, so none to read.
    const { xTitle: _x, yTitle: _y, ...look } = base;
    const chart = {
      ...(round ? { ...look, axis: true } : base),
      type,
      labels: { range: cell(0), cached: ['a', 'b', 'c', 'd'] },
      x: null,
      series: [
        {
          name: 'S',
          nameAt: { r: 0, c: 1 },
          values: cell(1),
          cached: [1, null, 3, 4],
          ...(round ? {} : { color: '#123456' }),
        },
      ],
    };
    const read = readXlsxChartXml(xlsxChartXml('Q', chart), 'Q');
    expect(fileChartSum({ ...read!, at: chart.at, width: 400, height: 300 })).toBe(
      fileChartSum(chart),
    );
  });

  it.each([
    ['column', 'stacked'],
    ['bar', 'percent'],
    ['area', 'stacked'],
    ['area', 'percent'],
  ] as const)('reads a %s chart %s (D283)', (type, stack) => {
    const chart = {
      ...base,
      type,
      stack,
      labels: { range: cell(0), cached: ['a', 'b', 'c', 'd'] },
      x: null,
      series: [1, 2].map((c) => ({ name: 'S', nameAt: { r: 0, c }, values: cell(c), cached: [] })),
    };
    const xml = xlsxChartXml('Q', chart);
    expect(xml).toContain(stack === 'percent' ? 'percentStacked' : '"stacked"');
    expect(xml.includes('<c:overlap val="100"/>')).toBe(type !== 'area');
    const read = readXlsxChartXml(xml, 'Q');
    expect(read!.stack).toBe(stack);
    expect(fileChartSum({ ...read!, at: chart.at, width: 400, height: 300 })).toBe(
      fileChartSum(chart),
    );
  });

  it('reads a smooth line chart, every series smooth (D285)', () => {
    const chart = {
      ...base,
      type: 'line' as const,
      smooth: true as const,
      labels: { range: cell(0), cached: ['a', 'b', 'c', 'd'] },
      x: null,
      series: [1, 2].map((c) => ({ name: 'S', nameAt: { r: 0, c }, values: cell(c), cached: [] })),
    };
    const xml = xlsxChartXml('Q', chart);
    expect(xml.match(/<c:smooth val="1"\/>/g)).toHaveLength(2);
    const read = readXlsxChartXml(xml, 'Q');
    expect(read!.smooth).toBe(true);
    expect(fileChartSum({ ...read!, at: chart.at, width: 400, height: 300 })).toBe(
      fileChartSum(chart),
    );
    expect(
      readXlsxChartXml(xlsxChartXml('Q', { ...chart, smooth: undefined }), 'Q')!.smooth,
    ).toBeUndefined();
  });

  it('writes a Combo chart as a group per series type on one pair of axes, and reads it back (D287)', () => {
    const chart = {
      ...base,
      type: 'combo' as const,
      values: true,
      smooth: true as const,
      labels: { range: cell(0), cached: ['a', 'b', 'c', 'd'] },
      x: null,
      series: (['column', 'area', 'line', 'column'] as const).map((type, i) => ({
        name: 'S',
        nameAt: { r: 0, c: i + 1 },
        values: cell(i + 1),
        cached: [],
        type,
        ...(i === 2 ? { color: '#aa0000' } : {}),
      })),
    };
    const xml = xlsxChartXml('Q', chart);
    // Areas, then columns, then lines, each group on the same two axes, the series' order across them.
    expect(xml.indexOf('<c:areaChart>')).toBeLessThan(xml.indexOf('<c:barChart>'));
    expect(xml.indexOf('<c:barChart>')).toBeLessThan(xml.indexOf('<c:lineChart>'));
    // Three groups and the category axis itself.
    expect(xml.match(/<c:axId val="500000001"\/>/g)).toHaveLength(4);
    expect(xml).toContain('<c:grouping val="clustered"/>');
    expect(xml.match(/<c:smooth val="1"\/>/g)).toHaveLength(1);
    const read = readXlsxChartXml(xml, 'Q')!;
    expect(read.type).toBe('combo');
    expect(read.series.map((s) => s.type)).toEqual(['column', 'area', 'line', 'column']);
    expect(read.series[2]!.color).toBe('#aa0000');
    expect(read.values).toBe(true);
    expect(read.smooth).toBe(true);
    expect(fileChartSum({ ...read, at: chart.at, width: 400, height: 300 })).toBe(
      fileChartSum(chart),
    );
    // A Combo chart's series types join its sum.
    const swapped = {
      ...chart,
      series: chart.series.map((s) => ({ ...s, type: 'line' as const })),
    };
    expect(fileChartSum(swapped)).not.toBe(fileChartSum(chart));
    // Values on one group only are not values on the chart.
    expect(
      readXlsxChartXml(xlsxChartXml('Q', chart).replace(/<c:dLbls>.*?<\/c:dLbls>/, ''), 'Q')!
        .values,
    ).toBe(false);
    // A series with no order of its own reads as the first; one with no type sums apart.
    const bare = readXlsxChartXml(xlsxChartXml('Q', chart).replace('<c:order val="0"/>', ''), 'Q')!;
    expect(bare.series.map((s) => s.type)).toEqual(['column', 'area', 'line', 'column']);
    expect(
      fileChartSum({ ...chart, series: chart.series.map(({ type: _t, ...s }) => s) }),
    ).not.toBe(fileChartSum(chart));
    // A column and a line alone write no area group.
    const two = { ...chart, series: chart.series.filter((s) => s.type !== 'area') };
    expect(xlsxChartXml('Q', two)).not.toContain('<c:areaChart>');
  });

  it('sums a chart with no stacking as before stacking was read', () => {
    const chart = { ...base, type: 'column' as const, labels: null, x: null, series: [] };
    expect(fileChartSum(chart)).not.toBe(fileChartSum({ ...chart, stack: 'stacked' }));
    expect(fileChartSum(chart)).toBe('0ef04d8b');
  });

  it('reads a scatter with its x, a series as a line and one as markers', () => {
    const chart = {
      ...base,
      type: 'scatter' as const,
      labels: null,
      x: { range: cell(1), cached: [1, 2, 3, 4] },
      series: [
        { name: 'A', nameAt: { r: 0, c: 2 }, values: cell(2), cached: [], color: '#112233' },
        { name: 'B', nameAt: { r: 0, c: 3 }, values: cell(3), cached: [], line: true as const },
      ],
    };
    const read = readXlsxChartXml(xlsxChartXml('Q', chart), 'Q');
    expect(read!.series.map((s) => [s.color, s.line])).toEqual([
      ['#112233', undefined],
      [undefined, true],
    ]);
    expect(fileChartSum({ ...read!, at: chart.at, width: 400, height: 300 })).toBe(
      fileChartSum(chart),
    );
  });
});
