// docs/specs/029-sheets/standard-mapping.md "Charts in the file", Reading (D277, D278, D279): an ODF sheet's drawings,
// when every one is a frame of a chart that qualifies, become its own charts, each keeping its document while it sums
// as it was read; any other drawing keeps every drawing of its sheet.
import { describe, expect, it } from 'vitest';
import {
  ByteBudget,
  listZip,
  ODF_MEDIA_TYPES,
  ODF_NS,
  parseXml,
  readZipEntry,
} from '@livedoc/office-packages';
import { AGENT_LOCALE, writeRows } from '../a1-io';
import { Workbook } from '../engine/workbook';
import type { SheetChart } from '../objects/sheet-objects';
import { applySheetWrite } from '../store';
import { emptyLayout, emptySheet, NOBODY, type Sheet } from '../sheet';
import { fileChartsOf, fileChartSum } from './file-charts';
import type { FileAt, KeptContent, KeptItem, KeptPart } from './kept-content';
import { odfLengthPx, parseOdfRef, readOdsChartDocument, readOdsCharts } from './ods-charts-read';
import { readOds } from './ods-read';
import { writeFlatOds, writeOds } from './ods-write';
import { sheetsFromFile, type FileSheet, type WorkbookFile } from './workbook-file';

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

const TYPES = ['scatter', 'column', 'bar', 'line', 'area', 'pie', 'doughnut', 'combo'] as const;

function chartOn(sheet: Sheet, extra: Partial<SheetChart> = {}): SheetChart {
  const { rows, cols } = sheet.layout;
  return {
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
}

const withCharts = (sheet: Sheet, charts: SheetChart[]): Sheet => ({
  ...sheet,
  layout: { ...sheet.layout, objects: charts },
});

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

const bytes = (text: string) => new TextEncoder().encode(text);

async function read(data: Uint8Array | string) {
  const got = await readOds(
    typeof data === 'string' ? bytes(data) : (data as Uint8Array<ArrayBuffer>),
  );
  if (!got.ok) throw new Error(got.rejection);
  return got;
}

describe('reading ODF charts', () => {
  it('reads a chart it wrote in a package back to the same chart, keeping its document', async () => {
    const sheet = withCharts(models(), [chartOn(models())]);
    const got = await read(writeOds(fileOf(sheet), 'charts').data);
    const [chart] = got.file.sheets[0]!.charts!;
    const [want] = fileOf(sheet).sheets[0]!.charts!;
    expect(chart!.kept).toEqual({ part: 'Object 1/content.xml', sum: fileChartSum(want!) });
    // The frame leaves the kept content; the object's folder entry goes with it.
    expect(got.file.kept?.items.some((i) => /draw:frame|table:shapes/.test(i.xml))).toBe(false);
    expect(got.file.kept?.parts.map((p) => p.name)).toEqual(['Object 1/content.xml']);
    const made = sheetsFromFile(got.file, AGENT_LOCALE, seeded(9));
    const { rows, cols } = made.sheets[0]!.layout;
    expect(made.sheets[0]!.layout.objects![0]).toEqual({
      ...chartOn(models()),
      id: expect.stringMatching(/^[a-z0-9]{6}$/),
      at: { r: rows[5], c: cols[5], dx: 4, dy: 2 },
      range: { r1: rows[0], c1: cols[1], r2: rows[3], c2: cols[3] },
      series: { [cols[3]!]: { color: '#aa3300', line: true }, [cols[2]!]: { color: '#0055cc' } },
      kept: chart!.kept,
    });
  });

  it('reads every type it writes, package and flat, to the sum it was written as', async () => {
    const base = models();
    const { rows, cols } = base.layout;
    const charts = TYPES.map((type, i): SheetChart => {
      const {
        axis: _axis,
        values: _values,
        ...chart
      } = chartOn(base, {
        id: `chart${i}`,
        type,
        at: { r: rows[5 + (i % 2) * 6]!, c: cols[i % 4]!, dx: 3, dy: 1 },
        range: {
          r1: rows[0]!,
          c1: cols[type === 'scatter' ? 1 : 0]!,
          r2: rows[3]!,
          c2: cols[type === 'pie' || type === 'doughnut' ? 1 : 3]!,
        },
        legend: (['top', 'right', 'bottom', 'left', 'none'] as const)[i % 5],
        ...(type === 'scatter' ? {} : { series: { [cols[1]!]: { color: '#123456' } } }),
      });
      return {
        ...chart,
        ...(i % 2 ? { axis: false as const } : {}),
        ...(i % 3 ? {} : { values: true as const }),
        // Every type stacked: a column, bar or area chart's is written (D283), another's is not.
        stack: i % 2 ? ('stacked' as const) : ('percent' as const),
        // Every type smooth: a line or Combo chart's is written (D285, D287), another's is not.
        smooth: true,
      };
    });
    const file = fileOf(withCharts(base, charts));
    const want = file.sheets[0]!.charts!.map(fileChartSum);
    expect(file.sheets[0]!.charts!.map((c) => c.smooth ?? false)).toEqual(
      TYPES.map((type) => type === 'line' || type === 'combo'),
    );
    expect(file.sheets[0]!.charts!.map((c) => c.stack ?? null)).toEqual(
      TYPES.map((type, i) =>
        ['column', 'bar', 'area'].includes(type) ? (i % 2 ? 'stacked' : 'percent') : null,
      ),
    );
    for (const data of [writeOds(file, 'all').data, writeFlatOds(file, 'all').data]) {
      const got = await read(data);
      const back = got.file.sheets[0]!.charts!;
      expect(back.map((c) => c.kept!.sum)).toEqual(want);
      expect(got.file.sheets[0]!.charts!.map(fileChartSum)).toEqual(want);
    }
  });

  it('writes the kept document while the chart sums the same, and anew, named, once it changed', async () => {
    const file = fileOf(withCharts(models(), [chartOn(models())]));
    const got = await read(writeOds(file, 'charts').data);
    const marked = new TextDecoder()
      .decode(got.file.kept!.parts[0]!.data)
      .replace('<chart:plot-area', '<chart:plot-area chart:style-name="marked"');
    const styles = '<office:document-styles/>';
    const kept: KeptContent<FileAt> = {
      ...got.file.kept!,
      parts: [
        { name: 'Object 1/content.xml', type: 'text/xml', data: bytes(marked), rels: [] },
        { name: 'Object 1/styles.xml', type: 'text/xml', data: bytes(styles), rels: [] },
      ],
    };
    const again = writeOds({ ...got.file, kept }, 'again');
    expect(again.losses).toEqual([]);
    const written = await entries(again.data);
    // Under a new object's name, its styles beside it; the kept folder itself is not reached.
    expect(written.get('Object 2/content.xml')).toBe(marked);
    expect(written.get('Object 2/styles.xml')).toBe(styles);
    expect(written.get('content.xml')).toContain('xlink:href="./Object 2"');
    expect(written.has('Object 1/content.xml')).toBe(false);
    const sheet = got.file.sheets[0]!;
    const changed = writeOds(
      {
        ...got.file,
        kept,
        sheets: [{ ...sheet, charts: [{ ...sheet.charts![0]!, title: 'New' }] }],
      },
      'changed',
    );
    expect(changed.losses).toEqual([{ k: 'chart_rewritten', sheet: 'Models' }]);
    const object = (await entries(changed.data)).get('Object 2/content.xml')!;
    expect(object).toContain('<text:p>New</text:p>');
    expect(object).not.toContain('marked');
  });

  it('keeps a flat file’s inline document, written inline to a flat file and anew to a package', async () => {
    const file = fileOf(withCharts(models(), [chartOn(models())]));
    const got = await read(writeFlatOds(file, 'flat').data);
    const [part] = got.file.kept!.parts;
    expect(part).toMatchObject({ name: 'Object 1/content.xml', type: ODF_MEDIA_TYPES.chart });
    const inline = new TextDecoder().decode(part!.data);
    // Its bindings on itself, so it stands alone.
    expect(inline).toMatch(/^<office:document xmlns:office="[^"]+"/);
    expect(parseXml(inline).ok).toBe(true);
    const flat = writeFlatOds(got.file, 'again');
    expect(flat.losses).toEqual([]);
    expect(flat.data).toContain(`<draw:object draw:notify-on-update-of-ranges=`);
    expect(flat.data).toContain(inline);
    const pkg = writeOds(got.file, 'package');
    expect(pkg.losses).toEqual([{ k: 'chart_rewritten', sheet: 'Models' }]);
    // A package's document written to a flat file is written anew too.
    const fromPackage = await read(writeOds(file, 'p').data);
    expect(writeFlatOds(fromPackage.file, 'f').losses).toEqual([
      { k: 'chart_rewritten', sheet: 'Models' },
    ]);
  });
});

// A chart document as LibreOffice writes one, its parts swapped in.
function doc(o: {
  cls?: string;
  styles?: string;
  plot?: string;
  axes?: string;
  series?: string;
  chart?: string;
}): string {
  return [
    `<office:document-content xmlns:office="${ODF_NS.office}" xmlns:style="${ODF_NS.style}" xmlns:text="${ODF_NS.text}" xmlns:table="${ODF_NS.table}" xmlns:draw="${ODF_NS.draw}" xmlns:svg="${ODF_NS.svg}" xmlns:chart="${ODF_NS.chart}" xmlns:c2="${ODF_NS.chart}" xmlns:x="urn:other">`,
    `<office:automatic-styles>${o.styles ?? ''}</office:automatic-styles>`,
    `<office:body><office:chart><chart:chart chart:class="${o.cls ?? 'chart:bar'}">${o.chart ?? ''}`,
    `<chart:plot-area${o.plot ?? ''}>`,
    o.axes ??
      '<chart:axis chart:dimension="x" chart:name="primary-x"><chart:categories table:cell-range-address="S.$A$2:.$A$4"/></chart:axis><chart:axis chart:dimension="y" chart:name="primary-y"/>',
    o.series ??
      '<chart:series chart:values-cell-range-address="S.B2:S.B4" chart:label-cell-address="S.B1"/>',
    '</chart:plot-area></chart:chart></office:chart></office:body></office:document-content>',
  ].join('');
}

const chartDoc = (o: Parameters<typeof doc>[0], sheet = 'S') => {
  const parsed = parseXml(doc(o));
  if (!parsed.ok) throw new Error('xml');
  return readOdsChartDocument(parsed.root, sheet);
};

const style = (name: string, chart = '', graphic = '') =>
  `<style:style style:name="${name}" style:family="chart">${chart ? `<style:chart-properties ${chart}/>` : ''}${graphic ? `<style:graphic-properties ${graphic}/>` : ''}</style:style>`;

describe('a chart document, read', () => {
  it('reads LibreOffice’s column chart: labels, names, legend, values on its plot, colours', () => {
    expect(
      chartDoc({
        styles:
          style('p', 'chart:data-label-number="value"') +
          style('s', '', 'draw:fill-color="#ABCDEF"') +
          style('y', 'chart:display-label="true"') +
          '<style:style style:family="chart"/>',
        plot: ' chart:style-name="p"',
        chart:
          '<chart:title><text:p>Cost</text:p><text:p>per model</text:p></chart:title><chart:legend chart:legend-position="top-end"/>',
        axes: '<chart:axis chart:dimension="x"><chart:title><text:p>Model</text:p></chart:title><chart:categories table:cell-range-address="S.A2:S.A4"/></chart:axis><chart:axis chart:dimension="y" chart:name="primary-y" chart:style-name="y"><chart:title><text:p> </text:p></chart:title></chart:axis>',
        series:
          '<chart:series chart:style-name="s" chart:class="chart:bar" chart:attached-axis="primary-y" chart:values-cell-range-address="S.B2:S.B4" chart:label-cell-address="S.B1:S.B1"/>',
      }),
    ).toEqual({
      id: '',
      type: 'column',
      title: 'Cost per model',
      xTitle: 'Model',
      legend: 'top',
      values: true,
      axis: true,
      labels: { range: { r1: 1, c1: 0, r2: 3, c2: 0 }, cached: [] },
      x: null,
      series: [
        {
          name: '',
          nameAt: { r: 0, c: 1 },
          values: { r1: 1, c1: 1, r2: 3, c2: 1 },
          cached: [],
          color: '#abcdef',
        },
      ],
    });
  });

  it('reads a bar chart by its vertical plot, legends by their side, an axis off three ways', () => {
    const plot = style('p', 'chart:vertical="true"');
    const legend = (at: string) =>
      chartDoc({ chart: `<chart:legend chart:legend-position="${at}"/>` });
    expect(chartDoc({ styles: plot, plot: ' chart:style-name="p"' })).toMatchObject({
      type: 'bar',
      legend: 'none',
      values: false,
      axis: true,
    });
    expect(['start', 'end', 'bottom-start', 'middle'].map((at) => legend(at)!.legend)).toEqual([
      'left',
      'right',
      'bottom',
      'right',
    ]);
    expect(chartDoc({ chart: '<chart:legend/>' })!.legend).toBe('right');
    const yAxis = (s: string) =>
      chartDoc({
        styles: style('y', s),
        axes: '<chart:axis chart:dimension="y" chart:name="primary-y" chart:style-name="y"/>',
      })!.axis;
    expect(yAxis('chart:visible="false"')).toBe(false);
    expect(yAxis('chart:display-label="false"')).toBe(false);
    expect(chartDoc({ axes: '' })!.axis).toBe(false);
  });

  it('reads a scatter’s x from its first series, a line by its stroke, markers by their fill', () => {
    const read = chartDoc({
      cls: 'chart:scatter',
      styles:
        style('m', '', 'draw:stroke="none" svg:stroke-color="#000000" draw:fill-color="#0055CC"') +
        style('l', '', 'svg:stroke-color="#AA3300" draw:fill-color="#000000"') +
        style('bare', 'chart:symbol-type="automatic"'),
      axes: '',
      series:
        '<chart:series chart:style-name="m" chart:values-cell-range-address="S.C2:S.C4"><chart:domain table:cell-range-address="S.B2:S.B4"/></chart:series>' +
        '<chart:series chart:style-name="l" chart:values-cell-range-address="S.D2:S.D4"><chart:domain table:cell-range-address="S.B2:S.B4"/></chart:series>' +
        '<chart:series chart:style-name="bare" chart:values-cell-range-address="S.E2:S.E4"/>',
    });
    expect(read).toMatchObject({
      type: 'scatter',
      x: { range: { r1: 1, c1: 1, r2: 3, c2: 1 } },
      labels: null,
      series: [{ color: '#0055cc' }, { color: '#aa3300', line: true }, { line: true }],
    });
    expect(read!.series[0]!.line).toBeUndefined();
    expect(read!.series[2]!.color).toBeUndefined();
  });

  it('reads a line’s colour by its stroke; a pie’s and a doughnut’s none, nor their axes’ titles', () => {
    const s = style('s', '', 'svg:stroke-color="#112233" draw:fill-color="#445566"');
    expect(
      chartDoc({ cls: 'chart:line', styles: s, series: seriesStyled('s') })!.series[0]!.color,
    ).toBe('#112233');
    expect(
      chartDoc({ cls: 'chart:area', styles: s, series: seriesStyled('s') })!.series[0]!.color,
    ).toBe('#445566');
    const titled =
      '<chart:axis chart:dimension="x" chart:name="primary-x"><chart:title><text:p>X</text:p></chart:title><chart:categories table:cell-range-address="S.A2:S.A4"/></chart:axis><chart:axis chart:dimension="y" chart:name="primary-y" chart:style-name="hidden"><chart:title><text:p>Y</text:p></chart:title></chart:axis><chart:axis chart:dimension="z"/>';
    for (const [cls, type] of [
      ['chart:circle', 'pie'],
      ['chart:ring', 'doughnut'],
    ] as const) {
      const read = chartDoc({
        cls,
        styles: s + style('hidden', 'chart:visible="false"'),
        axes: titled,
        series: seriesStyled('s', cls === 'chart:ring' ? ' chart:class="chart:circle"' : ''),
      })!;
      expect(read).toMatchObject({ type, axis: true, labels: { range: { c1: 0 } } });
      expect(read.series[0]!.color).toBeUndefined();
      expect(read.xTitle).toBeUndefined();
      expect(read.yTitle).toBeUndefined();
    }
    // A class by another prefix of the chart namespace reads the same.
    expect(chartDoc({ cls: 'c2:line' })!.type).toBe('line');
  });

  it('reads a bar or area chart’s stacking, LibreOffice’s 100% beside its stacked="false" (D283)', () => {
    const plot = ' chart:style-name="p"';
    expect(chartDoc({ styles: style('p', 'chart:stacked="true"'), plot })!.stack).toBe('stacked');
    expect(
      chartDoc({
        cls: 'chart:area',
        styles: style('p', 'chart:stacked="false" chart:percentage="true"'),
        plot,
      })!.stack,
    ).toBe('percent');
    expect(
      chartDoc({ styles: style('p', 'chart:vertical="true" chart:stacked="true"'), plot }),
    ).toMatchObject({ type: 'bar', stack: 'stacked' });
    expect(chartDoc({})!.stack).toBeUndefined();
  });

  it('reads a line chart’s cubic spline as smooth, another curve or another type’s not at all (D285)', () => {
    const plot = ' chart:style-name="p"';
    const curve = (cls: string, how: string) =>
      chartDoc({ cls, styles: style('p', `chart:interpolation="${how}"`), plot });
    expect(curve('chart:line', 'cubic-spline')!.smooth).toBe(true);
    expect(curve('chart:line', 'none')!.smooth).toBeUndefined();
    expect(curve('chart:line', 'b-spline')).toBeNull();
    expect(curve('chart:area', 'cubic-spline')).toBeNull();
  });

  it('reads LibreOffice’s Column and Line as a Combo chart, each series typed by its class (D287)', () => {
    const series = (col: string, cls = '') =>
      `<chart:series chart:values-cell-range-address="S.${col}2:S.${col}4" chart:label-cell-address="S.${col}1"${cls}/>`;
    const combo = (o: Parameters<typeof doc>[0] = {}) =>
      chartDoc({
        series:
          series('B') +
          series('C', ' chart:class="chart:area"') +
          series('D', ' chart:class="chart:line"'),
        ...o,
      });
    const read = combo()!;
    expect(read.type).toBe('combo');
    expect(read.series.map((s) => s.type)).toEqual(['column', 'area', 'line']);
    expect(read.smooth).toBeUndefined();
    const smooth = combo({
      styles: style('p', 'chart:interpolation="cubic-spline"'),
      plot: ' chart:style-name="p"',
    })!;
    expect(smooth.smooth).toBe(true);
    // A line chart whose series are bars is one too.
    expect(
      chartDoc({
        cls: 'chart:line',
        series: series('B', ' chart:class="chart:bar"') + series('C'),
      })!.series.map((s) => s.type),
    ).toEqual(['column', 'line']);
    // Not read: bars on their side, a stacking, a scatter among them.
    const flat = (chart: string) =>
      combo({ styles: style('p', chart), plot: ' chart:style-name="p"' });
    expect(flat('chart:vertical="true"')).toBeNull();
    expect(flat('chart:stacked="true"')).toBeNull();
    expect(
      chartDoc({ series: series('B') + series('C', ' chart:class="chart:scatter"') }),
    ).toBeNull();
    expect(
      chartDoc({
        cls: 'chart:scatter',
        series: series('B') + series('C', ' chart:class="chart:line"'),
      }),
    ).toBeNull();
  });

  it('reads a series on the secondary axis as on the right, of a line, area or combo chart alone (D288)', () => {
    const axes =
      '<chart:axis chart:dimension="x" chart:name="primary-x"/><chart:axis chart:dimension="y" chart:name="primary-y"/><chart:axis chart:dimension="y" chart:name="secondary-y"/>';
    const series =
      '<chart:series chart:values-cell-range-address="S.B2:S.B4"/><chart:series chart:values-cell-range-address="S.C2:S.C4" chart:attached-axis="secondary-y"/>';
    const right = (o: Parameters<typeof doc>[0]) => chartDoc({ axes, series, ...o });
    for (const cls of ['chart:line', 'chart:area'])
      expect(right({ cls })!.series.map((s) => s.right ?? false)).toEqual([false, true]);
    expect(
      right({
        series: series.replace('S.C4"', 'S.C4" chart:class="chart:line"'),
      })!.series.map((s) => [s.type, s.right ?? false]),
    ).toEqual([
      ['column', false],
      ['line', true],
    ]);
    expect(right({})).toBeNull();
    expect(
      right({
        cls: 'chart:area',
        styles: style('p', 'chart:stacked="true"'),
        plot: ' chart:style-name="p"',
      }),
    ).toBeNull();
  });

  it('reads none of what the model cannot draw (D277)', () => {
    const series = (attrs: string, inner = '') =>
      `<chart:series chart:values-cell-range-address="S.B2:S.B4"${attrs}>${inner}</chart:series>`;
    const cases: Parameters<typeof doc>[0][] = [
      { cls: 'chart:stock' },
      { cls: 'x:bar' },
      { cls: 'bar' },
      {
        cls: 'chart:line',
        styles: style('p', 'chart:stacked="true"'),
        plot: ' chart:style-name="p"',
      },
      {
        cls: 'chart:line',
        styles: style('p', 'chart:percentage="true"'),
        plot: ' chart:style-name="p"',
      },
      {
        styles: style('s', 'chart:stacked="true"'),
        series: '<chart:series chart:values-cell-range-address="S.B2:S.B4" chart:style-name="s"/>',
      },
      { styles: style('p', 'chart:three-dimensional="true"'), plot: ' chart:style-name="p"' },
      { styles: style('p', 'chart:interpolation="cubic-spline"'), plot: ' chart:style-name="p"' },
      {
        styles: style('s', 'chart:interpolation="b-spline"'),
        series: series(' chart:style-name="s"'),
      },
      { axes: '<chart:axis chart:dimension="y" chart:name="secondary-y"/>' },
      { axes: '<chart:axis chart:dimension="z" chart:name="primary-z"/>' },
      { series: series(' chart:class="chart:line"') },
      { series: series(' chart:attached-axis="secondary-y"') },
      { series: '<chart:series/>' },
      { series: '<chart:series chart:values-cell-range-address="Other.B2:Other.B4"/>' },
      { series: '<chart:series chart:values-cell-range-address="S.B2:S.C4"/>' },
      { series: series(' chart:label-cell-address="S.B1:S.C1"') },
      { series: series(' chart:label-cell-address="Other.B1"') },
      { series: series('', '<chart:domain table:cell-range-address="S.A2:S.A4"/>') },
      {
        axes: '<chart:axis chart:dimension="x" chart:name="primary-x"><chart:categories table:cell-range-address="Other.A2:Other.A4"/></chart:axis>',
      },
      { series: '' },
      { chart: '', series: '', axes: '<chart:plot-area/>' },
    ];
    for (const c of cases) expect(chartDoc(c), JSON.stringify(c)).toBeNull();
    const scatter = (inner: string) => chartDoc({ cls: 'chart:scatter', axes: '', series: inner });
    const dom = (at: string) => `<chart:domain table:cell-range-address="${at}"/>`;
    expect(scatter(series(''))).toBeNull();
    expect(scatter(series('', dom('S.A2:S.A4') + dom('S.A2:S.A4')))).toBeNull();
    expect(scatter(series('', dom('Other.A2:Other.A4')))).toBeNull();
    expect(
      scatter(
        series('', dom('S.A2:S.A4')) +
          '<chart:series chart:values-cell-range-address="S.C2:S.C4">' +
          dom('S.D2:S.D4') +
          '</chart:series>',
      ),
    ).toBeNull();
    // A document with no chart in it.
    const parsed = parseXml(`<office:document-content xmlns:office="${ODF_NS.office}"/>`);
    expect(parsed.ok && readOdsChartDocument(parsed.root, 'S')).toBeNull();
  });
});

const seriesStyled = (name: string, more = '') =>
  `<chart:series chart:style-name="${name}"${more} chart:values-cell-range-address="S.B2:S.B4" chart:label-cell-address="S.B1"/>`;

describe('a sheet’s drawings', () => {
  const NS = { draw: ODF_NS.draw, svg: ODF_NS.svg, xlink: ODF_NS.xlink, table: ODF_NS.table };
  const sheet: FileSheet = { name: 'S', rows: 10, cols: 5, cells: [] };
  const frame = (o: { href?: string; at?: string; inner?: string; size?: string } = {}) =>
    `<draw:frame draw:name="Chart 1"${o.at ?? ''}${o.size ?? ' svg:width="3.125in" svg:height="2.5in"'}>${
      o.inner ??
      `<draw:object xlink:href="${o.href ?? './Object 1'}"/><draw:image xlink:href="./ObjectReplacements/Object 1"/><svg:desc>Costs by model</svg:desc>`
    }</draw:frame>`;
  const inCell = (xml: string, r = 4, c = 1): KeptItem<FileAt> => ({
    place: 'cell',
    xml,
    ns: NS,
    at: { sheet: 0, r, c },
  });
  const shapes = (xml: string): KeptItem<FileAt> => ({
    place: 'table-before',
    xml: `<table:shapes>${xml}</table:shapes>`,
    ns: NS,
    at: { sheet: 0 },
  });
  const part = (name: string, text = ''): KeptPart => ({
    name,
    type: 'text/xml',
    data: bytes(text),
    rels: [],
  });
  const object = (n = 1, content = doc({})) => [
    part(`Object ${n}/`),
    part(`Object ${n}/content.xml`, content),
    part(`Object ${n}/styles.xml`, '<s/>'),
    part(`Object ${n}/meta.xml`, '<m/>'),
    part(`ObjectReplacements/Object ${n}`, 'png'),
  ];
  const kept = (items: KeptItem<FileAt>[], parts: KeptPart[] = object()): KeptContent<FileAt> => ({
    standard: 'odf',
    items,
    parts,
    relationships: [],
  });

  it('reads LibreOffice’s frame on a cell, in inches, its description its alt text', () => {
    const note: KeptItem<FileAt> = {
      place: 'cell',
      xml: '<office:annotation/>',
      ns: { office: ODF_NS.office },
      at: { sheet: 0, r: 0, c: 0 },
    };
    const got = readOdsCharts(
      [sheet],
      kept([inCell(frame({ at: ' svg:x="0.0417in" svg:y="0.0209in"' })), note]),
    );
    const [chart] = got.sheets[0]!.charts!;
    expect(chart).toMatchObject({
      type: 'column',
      at: { r: 4, c: 1, dx: 4, dy: 2 },
      width: 300,
      height: 240,
      alt: 'Costs by model',
      kept: { part: 'Object 1/content.xml' },
    });
    expect(chart!.kept!.sum).toBe(fileChartSum({ ...chart!, kept: undefined }));
    // Its content and styles stay kept; its folder, meta and replacement picture go; a note stays.
    expect(got.kept!.parts.map((p) => p.name)).toEqual([
      'Object 1/content.xml',
      'Object 1/styles.xml',
    ]);
    expect(got.kept!.items).toEqual([note]);
  });

  it('places a frame over the sheet by its lines, custom and hidden, an alt text that is the title none', () => {
    const lines = {
      c: {
        lines: new Map([
          [0, { size: 50 }],
          [1, { hidden: true as const }],
        ]),
        collapsed: [],
      },
      r: { lines: new Map(), collapsed: [], size: 20 },
    };
    const titled = doc({ chart: '<chart:title><text:p>Costs</text:p></chart:title>' });
    const inner = '<draw:object xlink:href="Object 1/"/><svg:title>Costs</svg:title>';
    const got = readOdsCharts(
      [{ ...sheet, lines }],
      kept([shapes(frame({ at: ' svg:x="180px" svg:y="45px"', inner }))], object(1, titled)),
    );
    // Column A 50 px, B hidden, C 120 px: 180 px is 10 into D; rows of 20 px: 45 px is 5 into row 3.
    expect(got.sheets[0]!.charts![0]).toMatchObject({ at: { r: 2, c: 3, dx: 10, dy: 5 } });
    expect(got.sheets[0]!.charts![0]!.alt).toBeUndefined();
    expect(got.kept!.items).toEqual([]);
    // A frame with no position sits at the sheet's top-left.
    const corner = readOdsCharts([sheet], kept([shapes(frame())]));
    expect(corner.sheets[0]!.charts![0]!.at).toEqual({ r: 0, c: 0, dx: 0, dy: 0 });
  });

  it('keeps every drawing of a sheet when one is not a chart that qualifies', () => {
    const chart = inCell(frame());
    const keeps = (items: KeptItem<FileAt>[], parts?: KeptPart[]) => {
      const content = kept(items, parts);
      const got = readOdsCharts([sheet], content);
      expect(got.sheets[0]!.charts, JSON.stringify(items.map((i) => i.xml))).toBeUndefined();
      expect(got.kept).toEqual(content);
    };
    keeps([chart, inCell(frame({ inner: '<draw:image xlink:href="Pictures/a.png"/>' }), 6, 1)]);
    keeps([chart, shapes('<draw:custom-shape/>')]);
    keeps([inCell(frame({ inner: '<draw:object xlink:href="./Object 1"/><draw:text-box/>' }))]);
    keeps([
      inCell(
        frame({
          inner: '<draw:object xlink:href="./Object 1"/><draw:object xlink:href="./Object 1"/>',
        }),
      ),
    ]);
    keeps([inCell(frame({ inner: '<draw:object/>' }))]);
    keeps([inCell(frame({ size: ' svg:width="2in"' }))]);
    keeps([chart], [...object(), part('Object 1/Pictures/a.png')]);
    keeps([chart], object(1, '<not xml'));
    keeps([inCell(frame({ href: './Object 9' }))]);
    keeps([chart], object(1, doc({ cls: 'chart:stock' })));
    // A frame on a repeated cell is on each of its cells.
    keeps([chart, inCell(frame(), 5, 1)]);
    // A drawing that does not parse.
    keeps([inCell('<draw:frame>')]);
  });

  it('reads nothing without kept content, and leaves a sheet with no drawings as it is', () => {
    expect(readOdsCharts([sheet], undefined)).toEqual({ sheets: [sheet], kept: undefined });
    const other = shapes(frame());
    // Another sheet's drawing, and shapes of another namespace.
    const content = kept([
      { ...other, at: { sheet: 1 } },
      { place: 'table-after', xml: '<x:shapes/>', ns: { x: 'urn:other' }, at: { sheet: 0 } },
    ]);
    expect(readOdsCharts([sheet], content)).toEqual({ sheets: [sheet], kept: content });
  });
});

describe('parseOdfRef', () => {
  it('reads a bare, absolute or quoted sheet, a cell or a block, the second end’s sheet optional', () => {
    expect(parseOdfRef('Models.B2:Models.B4')).toEqual({
      sheet: 'Models',
      range: { r1: 1, c1: 1, r2: 3, c2: 1 },
    });
    expect(parseOdfRef('$Models.$C$9:.$b$2')).toEqual({
      sheet: 'Models',
      range: { r1: 1, c1: 1, r2: 8, c2: 2 },
    });
    expect(parseOdfRef(" 'It''s: here'.A1 ")).toEqual({
      sheet: "It's: here",
      range: { r1: 0, c1: 0, r2: 0, c2: 0 },
    });
    expect(parseOdfRef('.A1')).toBeNull();
    expect(parseOdfRef('A.A1:B.A2')).toBeNull();
    expect(parseOdfRef('A.A1 A.A2')).toBeNull();
    expect(parseOdfRef('local-table.A1:.ZZZZ2')).toBeNull();
  });
});

describe('odfLengthPx', () => {
  it('reads each of ODF’s units at 96 px to the inch, and none of a length that is not one', () => {
    expect(['1in', '2.54cm', '25.4mm', '72pt', '6pc', '96px', '.5in'].map(odfLengthPx)).toEqual([
      96, 96, 96, 96, 96, 96, 48,
    ]);
    expect([undefined, '', '3', '1em', 'cm'].map(odfLengthPx)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
