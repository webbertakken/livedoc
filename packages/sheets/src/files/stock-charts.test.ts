// docs/specs/029-sheets/standard-mapping.md "Charts in the file" (D323): Candlestick and OHLC charts are written as
// each suite writes a stock chart (XLSX `c:stockChart`, ODF `chart:stock` in ODF's series order) and read back from
// either into the open, high, low, close order; counts no stock chart holds are written as the nearest type (D290).
import { describe, expect, it } from 'vitest';
import { parseXml } from '@livedoc/office-packages';
import { chartOriginalText, chartRestored, nearestFileChart } from './chart-nearest';
import { fileChartSum, type FileChart } from './file-charts';
import { odsChartContent } from './ods-charts';
import { readOdsChartDocument } from './ods-charts-read';
import { xlsxChartXml } from './xlsx-charts';
import { readXlsxChartXml } from './xlsx-charts-read';

const cell = (c: number) => ({ r1: 1, c1: c, r2: 5, c2: c });
const NAMES = ['Open', 'High', 'Low', 'Close'];
const stock = (type: 'candlestick' | 'ohlc', count = 4): FileChart => ({
  id: 'x',
  type,
  legend: 'bottom',
  values: false,
  axis: true,
  at: { r: 7, c: 0, dx: 0, dy: 0 },
  width: 400,
  height: 300,
  labels: { range: cell(0), cached: ['Jan', 'Feb', 'Mar', 'Apr', 'May'] },
  x: null,
  series: NAMES.slice(4 - count).map((name, i) => ({
    name,
    nameAt: { r: 0, c: i + 1 },
    values: cell(i + 1),
    cached: [],
    ...(i === 0 ? { color: '#aa3300' } : {}),
  })),
});
const placed = (read: object, like: FileChart) =>
  ({ ...read, at: like.at, width: like.width, height: like.height }) as FileChart;
const odf = (xml: string) => {
  const parsed = parseXml(xml);
  if (!parsed.ok) throw new Error('xml');
  return readOdsChartDocument(parsed.root, 'Q');
};

describe('a Candlestick or OHLC chart in XLSX', () => {
  it('is written as a stock chart with high-low lines and a candle’s up-down bars, and read back', () => {
    const candle = stock('candlestick');
    const xml = xlsxChartXml('Q', candle);
    expect(xml).toContain('<c:stockChart>');
    expect(xml).toContain(
      '<c:hiLowLines><c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="AA3300"/>',
    );
    expect(xml).toContain('<c:upDownBars><c:gapWidth val="150"/>');
    expect(xml).toContain('<c:marker><c:symbol val="none"/><c:spPr><a:solidFill>');
    const read = readXlsxChartXml(xml, 'Q')!;
    expect(read.type).toBe('candlestick');
    expect(read.series[0]!.color).toBe('#aa3300');
    expect(fileChartSum(placed(read, candle))).toBe(fileChartSum(candle));
  });

  it('marks an OHLC’s open and close as dashes, with no up-down bars, its three-series kind too', () => {
    const ohlc = stock('ohlc');
    const xml = xlsxChartXml('Q', ohlc);
    expect(xml).not.toContain('upDownBars');
    expect(xml.split('<c:symbol val="dash"/>')).toHaveLength(3);
    expect(fileChartSum(placed(readXlsxChartXml(xml, 'Q')!, ohlc))).toBe(fileChartSum(ohlc));
    const hlc = stock('ohlc', 3);
    const three = xlsxChartXml('Q', { ...hlc, series: hlc.series.map(({ color: _c, ...s }) => s) });
    expect(three.split('<c:symbol val="dash"/>')).toHaveLength(2);
    expect(three).toContain('<c:hiLowLines></c:hiLowLines>');
    expect(readXlsxChartXml(three, 'Q')!.type).toBe('ohlc');
  });

  it('writes a candle with no colour of its own in the suite’s', () => {
    const plain = stock('candlestick');
    const xml = xlsxChartXml('Q', {
      ...plain,
      series: plain.series.map(({ color: _c, ...s }) => s),
    });
    expect(xml).toContain('<c:upBars></c:upBars><c:downBars></c:downBars>');
  });

  it('keeps a stock chart of another count', () => {
    const xml = xlsxChartXml('Q', stock('ohlc'));
    const fifth = xml.replace('</c:ser><c:hiLowLines>', '</c:ser><c:ser></c:ser><c:hiLowLines>');
    expect(fifth).not.toBe(xml);
    expect(readXlsxChartXml(fifth, 'Q')).toBeNull();
  });
});

describe('a Candlestick or OHLC chart in ODF', () => {
  it('is written in ODF’s series order, a candle Japanese, and read back in the model’s', () => {
    const candle = stock('candlestick');
    const xml = odsChartContent('Q', candle, 'document-content');
    expect(xml).toContain('chart:class="chart:stock"');
    expect(xml).toContain('chart:japanese-candle-stick="true"');
    const order = [...xml.matchAll(/chart:values-cell-range-address="'Q'\.([A-Z])2/g)].map(
      (m) => m[1],
    );
    // Open, minimum (Low), maximum (High), close.
    expect(order).toEqual(['B', 'D', 'C', 'E']);
    const back = odf(xml)!;
    expect(back.type).toBe('candlestick');
    expect(back.series.map((s) => s.values.c1)).toEqual([1, 2, 3, 4]);
    expect(fileChartSum(placed(back, candle))).toBe(fileChartSum(candle));
  });

  it('reads a high-low-close OHLC back as it is', () => {
    const hlc = stock('ohlc', 3);
    const xml = odsChartContent('Q', hlc, 'document-content');
    expect(xml).not.toContain('japanese');
    expect(fileChartSum(placed(odf(xml)!, hlc))).toBe(fileChartSum(hlc));
  });

  // No suite draws ODF's open and close ticks of four series (LibreOffice 24.2 draws them as nonsense), so a four-series
  // OHLC is written as a Candlestick, its original kept (D323).
  it('writes an OHLC of four series as a Candlestick, and restores it', () => {
    const ohlc = stock('ohlc');
    const { original } = nearestFileChart(ohlc, 'odf');
    expect(original?.type).toBe('ohlc');
    expect(nearestFileChart(ohlc, 'xlsx').original).toBeNull();
    const back = odf(odsChartContent('Q', ohlc, 'document-content'))!;
    expect(back.type).toBe('candlestick');
    const restored = chartRestored(placed(back, ohlc), chartOriginalText(original!), 'odf');
    expect(fileChartSum(restored)).toBe(fileChartSum(ohlc));
  });

  it('keeps a stock chart with volume, or of two series', () => {
    const xml = odsChartContent('Q', stock('candlestick'), 'document-content');
    expect(
      odf(
        xml.replace(
          'chart:japanese-candle-stick="true"',
          'chart:japanese-candle-stick="true" chart:stock-with-volume="true"',
        ),
      ),
    ).toBeNull();
    const two = xml
      .replace(/<chart:series [^>]*><\/chart:series>/, '')
      .replace(/<chart:series [^>]*><\/chart:series>/, '');
    expect(odf(two)).toBeNull();
  });
});

describe('a stock chart no format holds', () => {
  it('writes a three-series Candlestick as OHLC and other counts as Line, restoring each', () => {
    const three = stock('candlestick', 3);
    expect(nearestFileChart(three, 'xlsx').chart.type).toBe('ohlc');
    const read = readXlsxChartXml(xlsxChartXml('Q', three), 'Q')!;
    expect(chartRestored(placed(read, three), read.original, 'xlsx').type).toBe('candlestick');
    const two = { ...stock('ohlc'), series: stock('ohlc').series.slice(0, 2) };
    expect(nearestFileChart(two, 'xlsx').chart.type).toBe('line');
    const five = {
      ...stock('ohlc'),
      series: [...stock('ohlc').series, { ...stock('ohlc').series[0]!, values: cell(5) }],
    };
    expect(nearestFileChart(five, 'xlsx').chart.type).toBe('line');
    expect(nearestFileChart(stock('candlestick'), 'xlsx').original).toBeNull();
  });
});
