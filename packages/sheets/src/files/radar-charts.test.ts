// docs/specs/029-sheets/standard-mapping.md "Charts in the file" (D292): a Radar chart is written as each suite
// writes one, lines with markers (XLSX `c:radarChart` of `radarStyle` `marker`, ODF `chart:radar`), and read back from
// either; a filled radar stays kept.
import { describe, expect, it } from 'vitest';
import { parseXml } from '@livedoc/office-packages';
import type { FileChart } from './file-charts';
import { fileChartSum } from './file-charts';
import { odsChartContent } from './ods-charts';
import { readOdsChartDocument } from './ods-charts-read';
import { xlsxChartXml } from './xlsx-charts';
import { readXlsxChartXml } from './xlsx-charts-read';

const cell = (c: number) => ({ r1: 1, c1: c, r2: 4, c2: c });
const radar: FileChart = {
  id: 'x',
  type: 'radar',
  legend: 'right',
  values: true,
  axis: true,
  title: 'Skills',
  at: { r: 6, c: 0, dx: 0, dy: 0 },
  width: 400,
  height: 300,
  labels: { range: cell(0), cached: ['Speed', 'Power', 'Range', 'Cost'] },
  x: null,
  series: [1, 2].map((c) => ({
    name: 'S',
    nameAt: { r: 0, c },
    values: cell(c),
    cached: [],
    ...(c === 2 ? { color: '#aa3300' } : {}),
  })),
};
const placed = (read: object) => ({ ...read, at: radar.at, width: 400, height: 300 }) as FileChart;

describe('a Radar chart in XLSX', () => {
  it('is written as a marked radar on a category and a value axis, and read back', () => {
    const xml = xlsxChartXml('Q', radar);
    expect(xml).toContain('<c:radarChart><c:radarStyle val="marker"/>');
    expect(xml).toContain('<c:catAx>');
    expect(xml).toContain('<a:ln w="28575"><a:solidFill><a:srgbClr val="AA3300"/>');
    const read = readXlsxChartXml(xml, 'Q')!;
    expect(read.type).toBe('radar');
    expect(read.series[1]!.color).toBe('#aa3300');
    expect(fileChartSum(placed(read))).toBe(fileChartSum(radar));
  });

  it('keeps a filled radar, and reads a plain one as Radar', () => {
    const xml = xlsxChartXml('Q', radar);
    expect(readXlsxChartXml(xml.replace('val="marker"', 'val="filled"'), 'Q')).toBeNull();
    expect(readXlsxChartXml(xml.replace('val="marker"', 'val="standard"'), 'Q')!.type).toBe(
      'radar',
    );
  });
});

describe('a Radar chart in ODF', () => {
  const read = (xml: string) => {
    const parsed = parseXml(xml);
    if (!parsed.ok) throw new Error('xml');
    return readOdsChartDocument(parsed.root, 'Q');
  };

  it('is written as a net chart with markers, and read back', () => {
    const xml = odsChartContent('Q', radar, 'document-content');
    expect(xml).toContain('chart:class="chart:radar"');
    expect(xml).toContain('chart:symbol-type="automatic"');
    const back = read(xml)!;
    expect(back.type).toBe('radar');
    expect(back.series[1]!.color).toBe('#aa3300');
    expect(fileChartSum(placed(back))).toBe(fileChartSum(radar));
  });

  it('keeps a filled radar', () => {
    const xml = odsChartContent('Q', radar, 'document-content');
    expect(
      read(xml.replace('chart:class="chart:radar"', 'chart:class="chart:filled-radar"')),
    ).toBeNull();
  });
});
