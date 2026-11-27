// docs/specs/029-sheets/standard-mapping.md "Charts in the file" (D321): a Bubble chart reads its range as a scatter
// does, its last series the sizes, written as each suite writes a bubble chart (XLSX `c:bubbleChart`, ODF
// `chart:bubble`, its values the sizes and its domains y then x) and read back from either; one with no sizes is
// written as a Scatter chart, its original kept (D290).
import { describe, expect, it } from 'vitest';
import { parseXml } from '@livedoc/office-packages';
import { AGENT_LOCALE, writeRows } from '../a1-io';
import { Workbook } from '../engine/workbook';
import { applySheetWrite } from '../store';
import { emptyLayout, emptySheet, NOBODY, type Sheet } from '../sheet';
import type { SheetChart } from '../objects/sheet-objects';
import { chartRestored, nearestFileChart } from './chart-nearest';
import { fileChartSum, fileChartsOf, sheetChartsFromFile, type FileChart } from './file-charts';
import { odsChartContent } from './ods-charts';
import { readOdsChartDocument } from './ods-charts-read';
import { xlsxChartXml } from './xlsx-charts';
import { readXlsxChartXml } from './xlsx-charts-read';

function seeded(seed = 5): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function models(): Sheet {
  const rand = seeded();
  const blank = emptySheet({
    id: 'sheet_b1',
    tabId: 't',
    title: 'Models',
    layout: emptyLayout(rand, 12, 6),
  });
  const made = writeRows(
    new Workbook({ sheets: [blank], locale: AGENT_LOCALE }),
    'sheet_b1',
    'A1',
    [
      ['Model', 'Cost', 'Index', 'Speed'],
      ['Opus', 15, 60, 30],
      ['Haiku', 1, 40, 90],
      ['Sonnet', 3, 55, null],
    ],
    rand,
  );
  if (!made.ok) throw new Error(made.error);
  return applySheetWrite(blank, made.write, { now: 0, by: NOBODY }).sheet;
}

function chartOf(sheet: Sheet, lastCol: number, extra: Partial<SheetChart> = {}): FileChart {
  const { rows, cols } = sheet.layout;
  const chart: SheetChart = {
    id: 'chart_1',
    kind: 'chart',
    type: 'bubble',
    at: { r: rows[6]!, c: cols[0]!, dx: 0, dy: 0 },
    width: 400,
    height: 300,
    range: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[lastCol]! },
    ...extra,
  };
  const withChart = { ...sheet, layout: { ...sheet.layout, objects: [chart] } };
  return fileChartsOf(
    new Workbook({ sheets: [withChart], locale: AGENT_LOCALE }),
    withChart,
    AGENT_LOCALE,
  )[0]!;
}

const placed = (read: object, like: FileChart) =>
  ({ ...read, at: like.at, width: like.width, height: like.height }) as FileChart;

const odf = (xml: string) => {
  const parsed = parseXml(xml);
  if (!parsed.ok) throw new Error('xml');
  return readOdsChartDocument(parsed.root, 'Models');
};

describe('a Bubble chart by position', () => {
  it('takes its names’ next column as x, then its series, its last column the sizes', () => {
    const chart = chartOf(models(), 3, { series: {} });
    expect(chart.x?.range).toEqual({ r1: 1, c1: 1, r2: 3, c2: 1 });
    expect(chart.series.map((s) => s.values.c1)).toEqual([2]);
    expect(chart.sizes).toEqual({ range: { r1: 1, c1: 3, r2: 3, c2: 3 }, cached: [30, 90, null] });
  });

  it('has no sizes with one series, and sums its sizes only when it has some', () => {
    const sheet = models();
    const bare = chartOf(sheet, 2);
    expect(bare.sizes).toBeUndefined();
    const sized = chartOf(sheet, 3);
    expect(fileChartSum({ ...sized, sizes: undefined })).not.toBe(fileChartSum(sized));
  });

  it('comes back to the model from its x to its sizes, its names left in the sheet as a scatter’s are', () => {
    const sheet = models();
    const [made] = sheetChartsFromFile([chartOf(sheet, 3)], sheet.layout, seeded(9));
    const { rows, cols } = sheet.layout;
    expect(made!.range).toEqual({ r1: rows[0], c1: cols[1], r2: rows[3], c2: cols[3] });
    expect(made!.cols).toBeUndefined();
  });
});

describe('a Bubble chart in XLSX', () => {
  it('is written as bubbles sized by its size column, on two value axes, and read back', () => {
    const chart = chartOf(models(), 3, { series: {} });
    const coloured = { ...chart, series: [{ ...chart.series[0]!, color: '#aa3300' }] };
    const xml = xlsxChartXml('Models', coloured);
    expect(xml).toContain('<c:bubbleChart><c:varyColors val="0"/>');
    expect(xml).toContain("<c:bubbleSize><c:numRef><c:f>'Models'!$D$2:$D$4</c:f>");
    expect(xml).toContain('<c:bubbleScale val="100"/><c:showNegBubbles val="0"/>');
    expect(xml).not.toContain('<c:catAx>');
    const read = readXlsxChartXml(xml, 'Models')!;
    expect(read.type).toBe('bubble');
    expect(read.sizes?.range).toEqual(chart.sizes!.range);
    expect(read.series[0]!.color).toBe('#aa3300');
    expect(fileChartSum(placed(read, coloured))).toBe(fileChartSum(coloured));
  });

  it('keeps a 3-D bubble, sizes from another column per series, or a series with no sizes', () => {
    const xml = xlsxChartXml('Models', chartOf(models(), 3));
    expect(
      readXlsxChartXml(xml.replace('<c:bubble3D val="0"/>', '<c:bubble3D val="1"/>'), 'Models'),
    ).toBeNull();
    expect(
      readXlsxChartXml(
        xml.replace('<c:bubbleScale', '<c:bubble3D val="1"/><c:bubbleScale'),
        'Models',
      ),
    ).toBeNull();
    expect(
      readXlsxChartXml(xml.replace(/<c:bubbleSize>.*<\/c:bubbleSize>/, ''), 'Models'),
    ).toBeNull();
    // Two series whose sizes differ.
    const two = xml.replace(
      '</c:ser>',
      '</c:ser><c:ser><c:idx val="1"/><c:order val="1"/><c:yVal><c:numRef><c:f>\'Models\'!$C$2:$C$4</c:f></c:numRef></c:yVal><c:bubbleSize><c:numRef><c:f>\'Models\'!$B$2:$B$4</c:f></c:numRef></c:bubbleSize></c:ser>',
    );
    expect(readXlsxChartXml(two, 'Models')).toBeNull();
  });
});

describe('a Bubble chart in ODF', () => {
  it('is written with its sizes as values and its y then x as domains, and read back', () => {
    const chart = chartOf(models(), 3);
    const xml = odsChartContent('Models', chart, 'document-content');
    expect(xml).toContain('chart:class="chart:bubble"');
    expect(xml).toContain(
      `chart:values-cell-range-address="'Models'.D2:'Models'.D4" chart:label-cell-address="'Models'.C1"`,
    );
    expect(xml).toContain(
      `<chart:domain table:cell-range-address="'Models'.C2:'Models'.C4"/><chart:domain table:cell-range-address="'Models'.B2:'Models'.B4"/>`,
    );
    const back = odf(xml)!;
    expect(back.type).toBe('bubble');
    expect(back.series[0]!.values).toEqual(chart.series[0]!.values);
    expect(fileChartSum(placed(back, chart))).toBe(fileChartSum(chart));
  });

  it('keeps a bubble series of one domain, or sizes differing between series', () => {
    const xml = odsChartContent('Models', chartOf(models(), 3), 'document-content');
    expect(
      odf(xml.replace(/<chart:domain [^/]*\/><\/chart:series>/, '</chart:series>')),
    ).toBeNull();
    const two = xml.replace(
      '</chart:series>',
      `</chart:series><chart:series chart:values-cell-range-address="'Models'.B2:'Models'.B4"><chart:domain table:cell-range-address="'Models'.C2:'Models'.C4"/><chart:domain table:cell-range-address="'Models'.B2:'Models'.B4"/></chart:series>`,
    );
    expect(odf(two)).toBeNull();
  });
});

describe('a Bubble chart with no header row', () => {
  // XLSX keeps a chart naming its series in itself (a name typed in the chart), as for every type.
  it('reads back from ODF, its sizes unnamed', () => {
    const sheet = models();
    const { rows } = sheet.layout;
    const chart = chartOf(sheet, 3);
    const bare = chartOf(sheet, 3, {
      range: { r1: rows[1]!, c1: sheet.layout.cols[1]!, r2: rows[3]!, c2: sheet.layout.cols[3]! },
    });
    expect(bare.series[0]!.nameAt).toBeNull();
    expect(bare.sizes?.range).toEqual(chart.sizes!.range);
    const ods = odf(odsChartContent('Models', bare, 'document-content'))!;
    expect(fileChartSum(placed(ods, bare))).toBe(fileChartSum(bare));
  });
});

describe('a Bubble chart with no sizes', () => {
  it('is written as a Scatter chart with its original, and read back as a Bubble chart (D290)', () => {
    const chart = chartOf(models(), 2);
    const { chart: held, original } = nearestFileChart(chart, 'xlsx');
    expect(held.type).toBe('scatter');
    expect(original).toEqual({ type: 'bubble', sum: fileChartSum(held as FileChart) });
    const xml = xlsxChartXml('Models', chart);
    expect(xml).toContain('<c:scatterChart>');
    const read = readXlsxChartXml(xml, 'Models')!;
    expect(chartRestored(placed(read, chart), read.original, 'xlsx').type).toBe('bubble');
    // Sized, it is a bubble chart of its own.
    expect(nearestFileChart(chartOf(models(), 3), 'xlsx').original).toBeNull();
  });
});
