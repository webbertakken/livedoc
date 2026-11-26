// docs/specs/029-sheets/standard-mapping.md "Charts in the file": a sheet's charts read by position, written as
// DrawingML in XLSX and as embedded chart documents in ODF, and left out beside a drawing the file kept (D261).
import { describe, expect, it } from 'vitest';
import { listZip, readZipEntry, ByteBudget } from '@livedoc/office-packages';
import { AGENT_LOCALE, writeRows } from '../a1-io';
import { Workbook } from '../engine/workbook';
import { applySheetWrite } from '../store';
import { emptyLayout, emptySheet, NOBODY, type Sheet } from '../sheet';
import type { SheetChart } from '../objects/sheet-objects';
import { WRITTEN_CONSTRUCTS } from '../validation/written-constructs';
import { excelFileWithKept, odfFlatWithKept } from '../testing/kept-files';
import { fileChartsOf, sheetChartsFromFile, type FileChart } from './file-charts';
import { odsChartContent, odsChartFrames } from './ods-charts';
import { writeFlatOds, writeOds } from './ods-write';
import { readOds } from './ods-read';
import { readXlsx } from './xlsx-read';
import { importReport } from './import-report';
import { quotedSheet, xlsxChartXml, xlsxDrawingXml } from './xlsx-charts';
import { writeXlsx } from './xlsx-write';

function seeded(seed = 3): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function costs(): Sheet {
  const rand = seeded();
  const blank = emptySheet({
    id: 'sheet_c1',
    tabId: 't',
    title: 'Costs',
    layout: emptyLayout(rand, 20, 6),
  });
  const made = writeRows(
    new Workbook({ sheets: [blank], locale: AGENT_LOCALE }),
    'sheet_c1',
    'A1',
    [
      ['Model', 'Cost', 'Index'],
      ['Opus', 15, 60],
      ['Sonnet', 3, null],
    ],
    rand,
  );
  if (!made.ok) throw new Error(made.error);
  return applySheetWrite(blank, made.write, { now: 0, by: NOBODY }).sheet;
}

const chartOver = (sheet: Sheet, extra: Partial<SheetChart> = {}): SheetChart => {
  const { rows, cols } = sheet.layout;
  return {
    id: 'chart_1',
    kind: 'chart',
    type: 'column',
    at: { r: rows[4]!, c: cols[4]!, dx: 3, dy: 2 },
    width: 400,
    height: 300,
    range: { r1: rows[0]!, c1: cols[0]!, r2: rows[2]!, c2: cols[2]! },
    ...extra,
  };
};

const withCharts = (sheet: Sheet, charts: SheetChart[]): Sheet => ({
  ...sheet,
  layout: { ...sheet.layout, objects: charts },
});

const filed = (sheet: Sheet) =>
  fileChartsOf(new Workbook({ sheets: [sheet], locale: AGENT_LOCALE }), sheet, AGENT_LOCALE);

describe('fileChartsOf', () => {
  it('reads a chart by position: its header, label column, series cells, cached values and look', () => {
    const sheet = costs();
    const [chart] = filed(
      withCharts(sheet, [
        chartOver(sheet, {
          title: 'T',
          xTitle: 'X',
          yTitle: 'Y',
          legend: 'top',
          values: true,
          axis: false,
          alt: 'A',
          series: { [sheet.layout.cols[1]!]: { color: '#112233' } },
        }),
      ]),
    );
    expect(chart).toEqual({
      id: 'chart_1',
      type: 'column',
      title: 'T',
      xTitle: 'X',
      yTitle: 'Y',
      legend: 'top',
      values: true,
      axis: false,
      alt: 'A',
      at: { r: 4, c: 4, dx: 3, dy: 2 },
      width: 400,
      height: 300,
      labels: { range: { r1: 1, c1: 0, r2: 2, c2: 0 }, cached: ['Opus', 'Sonnet'] },
      x: null,
      series: [
        {
          name: 'Cost',
          nameAt: { r: 0, c: 1 },
          values: { r1: 1, c1: 1, r2: 2, c2: 1 },
          cached: [15, 3],
          color: '#112233',
        },
        {
          name: 'Index',
          nameAt: { r: 0, c: 2 },
          values: { r1: 1, c1: 2, r2: 2, c2: 2 },
          cached: [60, null],
        },
      ],
    });
  });

  it('takes a scatter’s first column of numbers as its x when nothing labels the rows', () => {
    const sheet = costs();
    const { rows, cols } = sheet.layout;
    const [chart] = filed(
      withCharts(sheet, [
        chartOver(sheet, {
          type: 'scatter',
          range: { r1: rows[0]!, c1: cols[1]!, r2: rows[2]!, c2: cols[2]! },
          series: { [cols[2]!]: { line: true } },
        }),
      ]),
    );
    // Its first column has a name over numbers, so it labels the rows: they are the x.
    expect(chart!.labels).toBeNull();
    expect(chart!.x).toEqual({ range: { r1: 1, c1: 1, r2: 2, c2: 1 }, cached: [15, 3] });
    expect(chart!.series).toEqual([expect.objectContaining({ name: 'Index', line: true })]);
    expect(chart!.legend).toBe('bottom');
  });

  it('writes a chart with no data, or one over empty cells, with no series', () => {
    const sheet = costs();
    const { rows, cols } = sheet.layout;
    const charts = filed(
      withCharts(sheet, [
        chartOver(sheet, { range: undefined }),
        chartOver(sheet, {
          id: 'chart_2',
          range: { r1: rows[10]!, c1: cols[0]!, r2: rows[12]!, c2: cols[1]! },
        }),
      ]),
    );
    expect(charts.map((c) => [c.series.length, c.labels])).toEqual([
      [0, null],
      [2, null],
    ]);
    expect(charts[1]!.series[0]!.cached).toEqual([null, null, null]);
  });
});

const CHARTS = WRITTEN_CONSTRUCTS.charts!;
const chartsOf = () => CHARTS.sheets[0]!.charts!;

describe('xlsxChartXml', () => {
  const xml = (type: FileChart['type'], extra: Partial<FileChart> = {}) =>
    xlsxChartXml("Costs' sheet", { ...chartsOf()[0]!, ...extra, type });

  it('names each type’s chart element, a bar chart on its side and a round one without axes', () => {
    expect(xml('column')).toContain('<c:barDir val="col"/>');
    expect(xml('bar')).toMatch(/<c:barDir val="bar"\/>.*<c:catAx>.*<c:axPos val="l"\/>/);
    expect(xml('line')).toContain('<c:lineChart>');
    expect(xml('area')).toContain('<c:areaChart>');
    expect(xml('pie')).not.toContain('Ax>');
    expect(xml('doughnut')).toContain('<c:holeSize val="50"/>');
  });

  it('reads its cells by quoted reference, caches their values and leaves a gap a gap', () => {
    const out = xml('column');
    expect(out).toContain(`<c:f>'Costs'' sheet'!$B$1</c:f>`);
    expect(out).toContain(`<c:f>'Costs'' sheet'!$C$2:$C$4</c:f>`);
    expect(out).toContain('<c:dispBlanksAs val="gap"/>');
    expect(out).toContain(
      '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Cost &amp; "index"</a:t>',
    );
    expect(out).toContain('<a:solidFill><a:srgbClr val="1A73E8"/></a:solidFill>');
    expect(out).toMatch(/<c:dLbls>.*<c:showVal val="1"\/>/);
  });

  it('says a series’ own name, deletes a hidden value axis and the title, and leaves the legend out', () => {
    const named = { ...chartsOf()[0]!.series[1]!, nameAt: null };
    const out = xml('line', { title: undefined, legend: 'none', axis: false, series: [named] });
    expect(out).toContain('<c:tx><c:v>Index</c:v></c:tx>');
    expect(out).toContain('<c:autoTitleDeleted val="1"/>');
    expect(out).not.toContain('<c:legend>');
    expect(out).toMatch(/<c:valAx><c:axId val="500000002"\/>.*?<c:delete val="1"\/>/);
    expect(xml('line', { series: [{ ...named, color: '#ff0000' }] })).toContain(
      '<a:ln w="28575"><a:solidFill>',
    );
  });

  it('draws a scatter series as markers or as a line, its x as numbers or as labels', () => {
    const scatter = chartsOf().find((c) => c.type === 'scatter')!;
    const asLine = xlsxChartXml('S', scatter);
    expect(asLine).toContain('<c:xVal><c:numRef>');
    expect(asLine).toContain('<c:spPr><a:ln w="28575"><a:solidFill>');
    const dots = xlsxChartXml('S', {
      ...scatter,
      x: null,
      labels: chartsOf()[0]!.labels,
      series: [{ ...scatter.series[0]!, line: undefined }],
    });
    expect(dots).toContain('<c:xVal><c:strRef>');
    expect(dots).toContain('<a:ln><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/>');
    const plain = xlsxChartXml('S', {
      ...scatter,
      x: null,
      series: [{ ...scatter.series[0]!, line: undefined, color: undefined }],
    });
    expect(plain).not.toContain('<c:xVal>');
    expect(plain).not.toContain('<c:marker>');
  });

  it('quotes a sheet name, doubling its quotes', () => {
    expect(quotedSheet("It's")).toBe("'It''s'");
  });
});

describe('xlsxDrawingXml', () => {
  it('anchors each chart at its cell in EMU, naming it, its alt text or title as its description', () => {
    const [first, second] = chartsOf();
    const xml = xlsxDrawingXml(
      [first!, second!, { ...first!, title: undefined }],
      ['rId1', 'rId2', 'rId3'],
    );
    expect(xml).toContain(
      '<xdr:col>4</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>19050</xdr:rowOff>',
    );
    expect(xml).toContain('<xdr:ext cx="4000500" cy="2667000"/>');
    expect(xml).toContain('name="Chart 1" descr="Cost &amp; &quot;index&quot;"');
    expect(xml).toContain('name="Chart 2" descr="Costs by model"');
    expect(xml).toContain('<xdr:cNvPr id="4" name="Chart 3"/>');
    expect(xml).toContain('r:id="rId3"');
  });
});

async function entriesOf(bytes: Uint8Array<ArrayBuffer>): Promise<Map<string, string>> {
  const listed = listZip(bytes);
  if (!listed.ok) throw new Error(listed.refusal);
  const out = new Map<string, string>();
  for (const entry of listed.entries) {
    const read = await readZipEntry(bytes, entry, new ByteBudget(50_000_000));
    if (read.ok) out.set(entry.name, new TextDecoder().decode(read.bytes));
  }
  return out;
}

describe('writeXlsx with charts', () => {
  it('adds a drawing part with its chart parts, related from the worksheet', async () => {
    const out = writeXlsx(CHARTS, 'charts');
    expect(out.losses).toEqual([]);
    const entries = await entriesOf(out.data);
    expect(
      [...entries.keys()].filter((n) => /charts\/chart\d+\.xml$|drawings\//.test(n)).sort(),
    ).toEqual([
      'xl/charts/chart1.xml',
      'xl/charts/chart10.xml',
      'xl/charts/chart11.xml',
      'xl/charts/chart12.xml',
      'xl/charts/chart2.xml',
      'xl/charts/chart3.xml',
      'xl/charts/chart4.xml',
      'xl/charts/chart5.xml',
      'xl/charts/chart6.xml',
      'xl/charts/chart7.xml',
      'xl/charts/chart8.xml',
      'xl/charts/chart9.xml',
      'xl/drawings/_rels/drawing1.xml.rels',
      'xl/drawings/drawing1.xml',
    ]);
    expect(entries.get('xl/worksheets/sheet1.xml')).toMatch(/<drawing r:id="rId\d+"\/>/);
    expect(entries.get('xl/worksheets/_rels/sheet1.xml.rels')).toContain(
      'Target="../drawings/drawing1.xml"',
    );
    expect(entries.get('[Content_Types].xml')).toContain('drawingml.chart+xml');
  });

  it('writes no charts on a sheet keeping its file’s drawing, numbering its own past the kept parts', async () => {
    const read = await readXlsx(excelFileWithKept());
    if (!read.ok) throw new Error(read.rejection);
    const [first, ...rest] = read.file.sheets;
    const file = {
      ...read.file,
      sheets: [
        { ...first!, charts: chartsOf().slice(0, 1) },
        ...rest,
        { name: 'Fresh', rows: 10, cols: 4, cells: [], charts: chartsOf().slice(0, 1) },
      ],
    };
    const out = writeXlsx(file, 'kept');
    expect(out.losses).toContainEqual({ k: 'charts_unwritten', sheet: first!.name });
    const entries = await entriesOf(out.data);
    expect(entries.has('xl/drawings/drawing3.xml')).toBe(true);
    expect(importReport(out.losses)).toContainEqual({
      k: 'charts_unwritten',
      count: 1,
      names: [first!.name],
    });
  });
});

describe('ODF charts', () => {
  it('anchors each frame in its cell at its offset, charts sharing a cell in paint order (D280)', () => {
    const chart = chartsOf()[0]!;
    const frames = odsChartFrames(
      [
        { ...chart, at: { r: 2, c: 3, dx: 48, dy: 96 } },
        { ...chart, at: { r: 2, c: 3, dx: 0, dy: 0 }, title: undefined, labels: null, series: [] },
        { ...chart, at: { r: 0, c: 0, dx: 0, dy: 0 } },
      ],
      'S',
      [{ href: 'Object 1' }, { inline: '<x/>' }, { href: 'Object 3' }],
    );
    expect([...frames.keys()]).toEqual(['2,3', '0,0']);
    const shared = frames.get('2,3')!;
    // Half an inch across, an inch down, into the cell.
    expect(shared).toMatch(
      /^<draw:frame draw:z-index="0" draw:name="Chart 1" svg:x="1.270cm" svg:y="2.540cm"/,
    );
    expect(shared).toContain('xlink:href="./Object 1"');
    expect(shared).toContain('<svg:title>Cost &amp; "index"</svg:title>');
    expect(shared).toContain('<draw:frame draw:z-index="1" draw:name="Chart 2"');
    expect(shared).toContain('<draw:object><x/></draw:object></draw:frame>');
    expect(frames.get('0,0')).toContain('draw:z-index="2"');
  });

  it('writes each type’s class, its titles, legend, axes and series styles', () => {
    const [column, bar, line, , pie] = chartsOf();
    const scatter = chartsOf().find((c) => c.type === 'scatter')!;
    const doc = (c: FileChart) => odsChartContent("Costs' sheet", c, 'document-content');
    expect(doc(column!)).toMatch(
      /chart:class="chart:bar".*<chart:title><text:p>Cost &amp; "index"<\/text:p><\/chart:title><chart:legend chart:legend-position="bottom"\/>/,
    );
    expect(doc(column!)).toContain(
      `chart:values-cell-range-address="'Costs'' sheet'.C2:'Costs'' sheet'.C4"`,
    );
    expect(doc(column!)).toContain('chart:data-label-number="value"');
    expect(doc(bar!)).toContain('chart:vertical="true"');
    expect(doc(bar!)).toContain('chart:display-label="false"');
    expect(doc(bar!)).not.toContain('<chart:legend');
    expect(doc(line!)).toContain('chart:symbol-type="none"');
    expect(doc(pie!)).not.toContain('primary-y');
    expect(doc(pie!)).toMatch(
      /<chart:axis chart:dimension="x" chart:name="primary-x"><chart:categories /,
    );
    expect(doc(pie!)).not.toContain('draw:fill-color');
    expect(doc(scatter)).toContain('<chart:domain table:cell-range-address=');
    expect(
      doc({
        ...scatter,
        legend: 'left',
        series: [{ ...scatter.series[0]!, line: undefined, color: undefined }],
      }),
    ).toMatch(/draw:stroke="none".*legend-position="start"/);
    const plain = doc({
      ...column!,
      legend: 'right',
      values: false,
      series: [{ ...column!.series[1]! }],
    });
    expect(plain).toContain('legend-position="end"');
    // A shown axis says so, else LibreOffice draws it without labels (D279); no series style of its own.
    expect(plain).toContain(
      '<chart:axis chart:dimension="x" chart:name="primary-x" chart:style-name="axis">',
    );
    expect(plain).toContain(
      '<chart:axis chart:dimension="y" chart:name="primary-y" chart:style-name="axis">',
    );
    expect(plain).not.toContain('style:name="series');
    expect(odsChartContent('S', line!, 'document')).toMatch(
      /^<office:document office:mimetype="application\/vnd.oasis.opendocument.chart"/,
    );
  });

  it('writes a package’s objects past the kept ones, a flat file’s inline', async () => {
    const out = writeOds(CHARTS, 'charts');
    const entries = await entriesOf(out.data);
    expect(entries.get('META-INF/manifest.xml')).toContain(
      'manifest:full-path="Object 1/" manifest:media-type="application/vnd.oasis.opendocument.chart"',
    );
    expect(entries.get('Object 8/content.xml')).toContain('<office:document-content');
    // In its anchor cell, not over the sheet.
    expect(entries.get('content.xml')).not.toContain('<table:shapes>');
    expect(entries.get('content.xml')).toMatch(/<table:table-cell><draw:frame draw:z-index="0"/);
    const flat = writeFlatOds(CHARTS, 'charts').data;
    expect(flat).toContain('<draw:object draw:notify-on-update-of-ranges=');
    expect(flat).toContain(
      '<office:document office:mimetype="application/vnd.oasis.opendocument.chart"',
    );
  });

  it('writes no charts beside the shapes a sheet kept', async () => {
    const read = await readOds(new TextEncoder().encode(odfFlatWithKept()));
    if (!read.ok) throw new Error(read.rejection);
    const file = {
      ...read.file,
      sheets: read.file.sheets.map((s) => ({ ...s, charts: chartsOf().slice(0, 1) })),
    };
    const out = writeFlatOds(file, 'kept');
    expect(out.losses).toContainEqual({ k: 'charts_unwritten', sheet: read.file.sheets[0]!.name });
  });
});

describe('charts without a header or label column', () => {
  // pie-chart.md "Scatter's point names": the names stay in the sheet; the file's x is the first column of numbers.
  it('names series by column, and takes a scatter over text labels’ next column as its x, in both formats', () => {
    const sheet = costs();
    const { rows, cols } = sheet.layout;
    const numbers = { r1: rows[1]!, c1: cols[1]!, r2: rows[2]!, c2: cols[2]! };
    const [column, scatter] = filed(
      withCharts(sheet, [
        chartOver(sheet, { range: numbers }),
        chartOver(sheet, { id: 'chart_s', type: 'scatter' }),
      ]),
    );
    expect(column!.series[0]).toMatchObject({ name: 'Column B', nameAt: null });
    expect(column!.labels).toBeNull();
    expect(scatter!.x).toEqual({ range: { r1: 1, c1: 1, r2: 2, c2: 1 }, cached: [15, 3] });
    const xlsx = xlsxChartXml('S', column!);
    expect(xlsx).not.toContain('<c:cat>');
    expect(xlsx).toContain('<c:tx><c:v>Column B</c:v></c:tx>');
    expect(odsChartContent('S', column!, 'document-content')).not.toContain(
      'chart:label-cell-address',
    );
  });
});

describe('a scatter over numbers alone, and picked columns', () => {
  it('takes the first column as x when there are two, none with one, and reads only picked columns', () => {
    const sheet = costs();
    const { rows, cols } = sheet.layout;
    const over = (c2: number) => ({ r1: rows[1]!, c1: cols[1]!, r2: rows[2]!, c2: cols[c2]! });
    const [two, one, picked] = filed(
      withCharts(sheet, [
        chartOver(sheet, { type: 'scatter', range: over(2) }),
        chartOver(sheet, { id: 'chart_o', type: 'scatter', range: over(1) }),
        chartOver(sheet, { id: 'chart_p', cols: [cols[0]!, cols[2]!] }),
      ]),
    );
    expect(two!.x).toEqual({ range: { r1: 1, c1: 1, r2: 2, c2: 1 }, cached: [15, 3] });
    expect(two!.series.map((s) => s.name)).toEqual(['Column C']);
    expect([one!.x, one!.series.length]).toEqual([null, 1]);
    expect(picked!.series.map((s) => s.name)).toEqual(['Index']);
  });
});

// standard-mapping.md "Charts in the file", Reading: a read chart becomes the sheet's own by its ids.
describe('sheetChartsFromFile', () => {
  const layout = emptyLayout(seeded(4), 10, 6);
  const { rows, cols } = layout;
  const cell = (c: number, r1 = 1, r2 = 4) => ({ r1, c1: c, r2, c2: c });
  const read = (extra: Partial<FileChart> = {}): FileChart => ({
    id: '',
    type: 'column',
    legend: 'bottom',
    values: false,
    axis: true,
    at: { r: 2, c: 1, dx: 5, dy: 6 },
    width: 300,
    height: 200,
    labels: null,
    x: null,
    series: [{ name: 'A', nameAt: null, values: cell(2), cached: [] }],
    ...extra,
  });

  it('names its place and block by ids, a gap in its columns listed, looks by column, the defaults left out', () => {
    const [chart] = sheetChartsFromFile(
      [
        read({
          labels: { range: cell(0), cached: [] },
          series: [
            { name: 'A', nameAt: { r: 0, c: 2 }, values: cell(2), cached: [], color: '#112233' },
            { name: 'B', nameAt: { r: 0, c: 4 }, values: cell(4), cached: [], line: true },
          ],
        }),
      ],
      layout,
      seeded(),
    );
    expect(chart).toEqual({
      id: expect.stringMatching(/^[a-z0-9]{6}$/),
      kind: 'chart',
      at: { r: rows[2], c: cols[1], dx: 5, dy: 6 },
      width: 300,
      height: 200,
      type: 'column',
      range: { r1: rows[0], c1: cols[0], r2: rows[4], c2: cols[4] },
      cols: [cols[0], cols[2], cols[4]],
      series: { [cols[2]!]: { color: '#112233' }, [cols[4]!]: { line: true } },
    });
  });

  it('reads a scatter’s x as its first column, and leaves out a chart past the sheet', () => {
    const charts = sheetChartsFromFile(
      [
        read({ type: 'scatter', x: { range: cell(1), cached: [] }, legend: 'none' }),
        read({ at: { r: 40, c: 0, dx: 0, dy: 0 } }),
        read({ series: [{ name: 'A', nameAt: null, values: cell(2, 1, 40), cached: [] }] }),
        read({ series: [] }),
      ],
      layout,
      seeded(),
    );
    expect(charts).toHaveLength(1);
    expect(charts[0]).toMatchObject({
      type: 'scatter',
      legend: 'none',
      range: { r1: rows[1], c1: cols[1], r2: rows[4], c2: cols[2] },
    });
    expect(charts[0]!.cols).toBeUndefined();
  });

  it('keeps titles, alt, values, a hidden axis, its stacking and its kept XML', () => {
    const kept = { part: 'xl/charts/chart1.xml', sum: '0123abcd' };
    const [chart] = sheetChartsFromFile(
      [
        read({
          title: 'T',
          xTitle: 'X',
          yTitle: 'Y',
          alt: 'A',
          values: true,
          axis: false,
          kept,
          stack: 'percent',
          smooth: true,
        }),
      ],
      layout,
      seeded(),
    );
    expect(chart).toMatchObject({
      stack: 'percent',
      smooth: true,
      title: 'T',
      xTitle: 'X',
      yTitle: 'Y',
      alt: 'A',
      values: true,
      axis: false,
      kept,
    });
    expect(sheetChartsFromFile(undefined, layout, seeded())).toEqual([]);
  });
});

describe('a read chart, written', () => {
  it('carries its kept XML’s name and sum to the file', () => {
    const sheet = costs();
    const kept = { part: 'xl/charts/chart1.xml', sum: '0123abcd' };
    expect(filed(withCharts(sheet, [chartOver(sheet, { kept })]))[0]!.kept).toEqual(kept);
  });
});
