// docs/specs/029-sheets/standard-mapping.md "Charts in the file", "Written as the nearest type" (D290): a Stepped Area
// chart (and a Combo chart's stepped area series) is written as an Area chart (series), its original kept in the
// chart's own document, restored on reading while the chart still sums as written; the write names it.
import { describe, expect, it } from 'vitest';
import { ByteBudget, listZip, readZipEntry } from '@livedoc/office-packages';
import { AGENT_LOCALE, writeRows } from '../a1-io';
import { Workbook } from '../engine/workbook';
import type { SheetChart } from '../objects/sheet-objects';
import { applySheetWrite } from '../store';
import { emptyLayout, emptySheet, NOBODY, type Sheet } from '../sheet';
import {
  CHART_ORIGINAL_TEXT_MAX,
  chartOriginalText,
  chartRestored,
  nearestFileChart,
} from './chart-nearest';
import { fileChartsOf, fileChartSum, type FileChart } from './file-charts';
import { importReport } from './import-report';
import { importReportLine } from './import-report-copy';
import { readOds } from './ods-read';
import { writeFlatOds, writeOds } from './ods-write';
import { readXlsx } from './xlsx-read';
import { readXlsxChartXml } from './xlsx-charts-read';
import { writeXlsx } from './xlsx-write';
import { sheetsFromFile, type WorkbookFile } from './workbook-file';

function seeded(seed = 5): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function sales(): Sheet {
  const rand = seeded();
  const blank = emptySheet({
    id: 'sheet_s1',
    tabId: 't',
    title: 'Sales',
    layout: emptyLayout(rand, 20, 8),
  });
  const made = writeRows(
    new Workbook({ sheets: [blank], locale: AGENT_LOCALE }),
    'sheet_s1',
    'A1',
    [
      ['Month', 'North', 'South', 'Margin'],
      ['Jan', 10, 7, 0.2],
      ['Feb', 12, null, 0.25],
      ['Mar', 9, 8, 0.3],
    ],
    rand,
  );
  if (!made.ok) throw new Error(made.error);
  return applySheetWrite(blank, made.write, { now: 0, by: NOBODY }).sheet;
}

function charted(extra: Partial<SheetChart>): Sheet {
  const sheet = sales();
  const { rows, cols } = sheet.layout;
  const chart: SheetChart = {
    id: 'chart1',
    kind: 'chart',
    type: 'stepped-area',
    at: { r: rows[5]!, c: cols[0]!, dx: 0, dy: 0 },
    width: 420,
    height: 280,
    range: { r1: rows[0]!, c1: cols[0]!, r2: rows[3]!, c2: cols[2]! },
    title: 'Steps',
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
const chartOf = (sheet: Sheet): FileChart => fileOf(sheet).sheets[0]!.charts![0]!;

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

async function readBack(data: Uint8Array | string, xlsx = false): Promise<WorkbookFile> {
  const bytes = (
    typeof data === 'string' ? new TextEncoder().encode(data) : data
  ) as Uint8Array<ArrayBuffer>;
  const got = xlsx ? await readXlsx(bytes) : await readOds(bytes);
  if (!got.ok) throw new Error(got.rejection);
  return got.file;
}

describe('nearestFileChart', () => {
  it('writes a Stepped Area chart as an Area chart of the same stacking, keeping the original', () => {
    const chart = chartOf(charted({ stack: 'stacked' }));
    const { chart: held, original } = nearestFileChart(chart, 'xlsx');
    expect(held.type).toBe('area');
    expect(held.stack).toBe('stacked');
    expect(original).toEqual({ type: 'stepped-area', sum: fileChartSum(held as FileChart) });
  });

  it('writes a Combo chart’s stepped area series as area ones, keeping every series’ type', () => {
    const sheet = charted({ type: 'combo' });
    const col = sheet.layout.cols[2]!;
    const chart = chartOf({
      ...sheet,
      layout: {
        ...sheet.layout,
        objects: [
          {
            ...(sheet.layout.objects![0] as SheetChart),
            series: { [col]: { type: 'stepped-area' } },
          },
        ],
      },
    });
    const { chart: held, original } = nearestFileChart(chart, 'xlsx');
    expect(held.series.map((s) => s.type)).toEqual(['column', 'area']);
    expect(original).toEqual({
      type: 'combo',
      series: ['column', 'stepped-area'],
      sum: fileChartSum(held as FileChart),
    });
  });

  it('keeps nothing for a type a file holds', () => {
    const chart = chartOf(charted({ type: 'area' }));
    expect(nearestFileChart(chart, 'xlsx')).toEqual({ chart, original: null });
    const combo = chartOf(charted({ type: 'combo' }));
    expect(nearestFileChart(combo, 'xlsx').original).toBeNull();
  });
});

describe('chartRestored', () => {
  const chart = chartOf(charted({}));
  const { chart: held, original } = nearestFileChart(chart, 'xlsx');
  const read = held as FileChart;
  const text = chartOriginalText(original!);

  it('reads the original back while the chart sums as written', () => {
    expect(chartRestored(read, text, 'xlsx')).toEqual(chart);
  });

  it('passes over a record that is missing, too long, unreadable or not a record', () => {
    for (const bad of [undefined, 'x'.repeat(CHART_ORIGINAL_TEXT_MAX + 1), '{', 'null', '7', '[]'])
      expect(chartRestored(read, bad, 'xlsx')).toBe(read);
  });

  it('passes over a record of an unknown type, or once the chart changed elsewhere', () => {
    expect(chartRestored(read, JSON.stringify({ ...original, type: 'radar' }), 'xlsx')).toBe(read);
    expect(chartRestored({ ...read, title: 'Changed' }, text, 'xlsx')).toEqual({
      ...read,
      title: 'Changed',
    });
  });

  it('passes over a record naming a type the chart is not the nearest of', () => {
    const line = JSON.stringify({ type: 'line', sum: fileChartSum(read) });
    expect(chartRestored(read, line, 'xlsx')).toBe(read);
    // A record naming the type the chart is restores nothing.
    expect(
      chartRestored(read, JSON.stringify({ type: 'area', sum: fileChartSum(read) }), 'xlsx'),
    ).toBe(read);
  });

  it('passes over a Combo record whose series types do not fit', () => {
    const combo = {
      ...read,
      type: 'combo' as const,
      series: read.series.map((s) => ({ ...s, type: 'area' as const })),
    };
    const sum = fileChartSum(combo);
    for (const series of [undefined, 'area', ['area'], ['area', 'pie']])
      expect(chartRestored(combo, JSON.stringify({ type: 'combo', series, sum }), 'xlsx')).toBe(
        combo,
      );
    expect(
      chartRestored(
        combo,
        JSON.stringify({ type: 'combo', series: ['stepped-area', 'area'], sum }),
        'xlsx',
      ).series.map((s) => s.type),
    ).toEqual(['stepped-area', 'area']);
  });
});

describe('a Stepped Area chart in XLSX', () => {
  it('is written as an Area chart with LiveDoc’s extension, named, and read back as Stepped Area', async () => {
    const sheet = charted({ stack: 'percent' });
    const written = writeXlsx(fileOf(sheet), 'steps');
    expect(written.losses).toEqual([{ k: 'chart_nearest_type', sheet: 'Sales' }]);
    const xml = (await entries(written.data)).get('xl/charts/chart1.xml')!;
    expect(xml).toContain('<c:areaChart><c:grouping val="percentStacked"/>');
    expect(xml).toContain('<c:extLst><c:ext uri="https://docs.nu/ns/chart/1"><ldc:original');
    const file = await readBack(written.data, true);
    const [chart] = file.sheets[0]!.charts!;
    expect(chart!.type).toBe('stepped-area');
    expect(chart!.stack).toBe('percent');
    expect(chart!.kept!.sum).toBe(fileChartSum(chartOf(sheet)));
    const made = sheetsFromFile(file, AGENT_LOCALE, seeded(9));
    expect(made.sheets[0]!.layout.objects![0]).toMatchObject({
      type: 'stepped-area',
      stack: 'percent',
    });
    // Written again unchanged, its kept part is written, and it is still named.
    const again = writeXlsx(file, 'again');
    expect(again.losses).toEqual([{ k: 'chart_nearest_type', sheet: 'Sales' }]);
    expect((await entries(again.data)).get('xl/charts/chart1.xml')).toBe(xml);
  });

  it('reads as an Area chart without LiveDoc’s extension, or with another one', async () => {
    const xml = (await entries(writeXlsx(fileOf(charted({})), 'steps').data)).get(
      'xl/charts/chart1.xml',
    )!;
    expect(readXlsxChartXml(xml, 'Sales')!.original).toBe(
      JSON.stringify(nearestFileChart(chartOf(charted({})), 'xlsx').original),
    );
    const none = xml.replace(/<c:extLst>.*<\/c:extLst>/, '');
    expect(readXlsxChartXml(none, 'Sales')).not.toHaveProperty('original');
    const other = xml.replace('https://docs.nu/ns/chart/1"><ldc', 'urn:other"><ldc');
    expect(readXlsxChartXml(other, 'Sales')).not.toHaveProperty('original');
  });
});

describe('a Stepped Area chart in ODF', () => {
  it('is written as an Area chart, its original in the object’s meta.xml, and read back', async () => {
    const sheet = charted({});
    const written = writeOds(fileOf(sheet), 'steps');
    expect(written.losses).toEqual([{ k: 'chart_nearest_type', sheet: 'Sales' }]);
    const parts = await entries(written.data);
    expect(parts.get('Object 1/content.xml')).toContain('chart:class="chart:area"');
    expect(parts.get('Object 1/meta.xml')).toContain('meta:name="LiveDoc chart"');
    expect(parts.get('META-INF/manifest.xml')).toContain('Object 1/meta.xml');
    const file = await readBack(written.data);
    expect(file.sheets[0]!.charts![0]!.type).toBe('stepped-area');
    // Written again unchanged, the kept document and a fresh meta.xml, under a new object name.
    const again = await entries(writeOds(file, 'again').data);
    const name = [...again.keys()].find((n) => /^Object \d+\/meta\.xml$/.test(n))!;
    expect(again.get(name)).toBe(parts.get('Object 1/meta.xml'));
    expect(again.get(name.replace('meta', 'content'))).toBe(parts.get('Object 1/content.xml'));
  });

  it('keeps the original inline in a flat file’s chart document', async () => {
    const written = writeFlatOds(fileOf(charted({ stack: 'stacked' })), 'steps');
    expect(written.losses).toEqual([{ k: 'chart_nearest_type', sheet: 'Sales' }]);
    expect(written.data).toMatch(
      /<office:document office:mimetype="[^"]+chart" office:version="[^"]+"><office:meta><meta:user-defined meta:name="LiveDoc chart" meta:value-type="string">/,
    );
    const file = await readBack(written.data);
    const [chart] = file.sheets[0]!.charts!;
    expect(chart).toMatchObject({ type: 'stepped-area', stack: 'stacked' });
    expect(writeFlatOds(file, 'again').data).toContain('meta:name="LiveDoc chart"');
  });

  it('reads as an Area chart without its original', async () => {
    const written = await entries(writeOds(fileOf(charted({})), 'steps').data);
    const flat = writeFlatOds(fileOf(charted({})), 'steps').data;
    const file = await readBack(
      flat.replace(/<office:meta><meta:user-defined[^]*?<\/office:meta>/, ''),
    );
    expect(file.sheets[0]!.charts![0]!.type).toBe('area');
    expect(written.has('Object 1/meta.xml')).toBe(true);
  });

  it('writes no meta.xml for a type the file holds', async () => {
    const parts = await entries(writeOds(fileOf(charted({ type: 'area' })), 'area').data);
    expect(parts.has('Object 1/meta.xml')).toBe(false);
  });
});

describe('a Combo chart’s stepped area series in both formats', () => {
  const sheet = charted({ type: 'combo' });
  const col = sheet.layout.cols[2]!;
  const combo: Sheet = {
    ...sheet,
    layout: {
      ...sheet.layout,
      objects: [
        {
          ...(sheet.layout.objects![0] as SheetChart),
          series: { [col]: { type: 'stepped-area' } },
        },
      ],
    },
  };

  it('reads back each series’ type, the step its own column’s', async () => {
    const files = [
      await readBack(writeXlsx(fileOf(combo), 'c').data, true),
      await readBack(writeOds(fileOf(combo), 'c').data),
      await readBack(writeFlatOds(fileOf(combo), 'c').data),
    ];
    for (const file of files) {
      expect(file.sheets[0]!.charts![0]!.series.map((s) => s.type)).toEqual([
        'column',
        'stepped-area',
      ]);
      const made = sheetsFromFile(file, AGENT_LOCALE, seeded(9)).sheets[0]!;
      const object = made.layout.objects![0] as SheetChart;
      expect(object.series).toEqual({ [made.layout.cols[2]!]: { type: 'stepped-area' } });
    }
  });
});

describe('the write’s report', () => {
  it('names the sheets whose charts are written as the nearest type', () => {
    const [line] = importReport([
      { k: 'chart_nearest_type', sheet: 'Sales' },
      { k: 'chart_nearest_type', sheet: 'Sales' },
    ]);
    expect(importReportLine(line!)).toBe(
      '2 charts of types the format does not hold are written as the nearest type it does, and read back by LiveDoc as made: Sales',
    );
  });
});
