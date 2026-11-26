// A sheet's charts in ODF (docs/specs/029-sheets/standard-mapping.md "Charts in the file"): a `draw:frame` per chart in
// the cell it is anchored to, at its offset into that cell, holding a `draw:object` that names
// an embedded chart document whose series read the sheet's cells by address. Elements in ODF 1.4's schema order.
import {
  escapeXmlAttribute,
  escapeXmlText,
  ODF_MEDIA_TYPES,
  ODF_NS,
  ODF_VERSION,
} from '@livedoc/office-packages';
import { columnLetters } from '../address';
import {
  chartOriginalText,
  nearestFileChart,
  type ChartOriginal,
  type HeldChartType,
  type HeldFileChart,
} from './chart-nearest';
import { fileChartSum, type FileChart, type FileChartSeries, type FileRange } from './file-charts';
import type { KeptPart } from './kept-content';
import type { FileLoss } from './workbook-file';

const CHART_MEDIA_TYPE = ODF_MEDIA_TYPES.chart;

// A px at 100% in centimetres (96 px to the inch).
const CM_PER_PX = 2.54 / 96;
const cm = (px: number) => `${(px * CM_PER_PX).toFixed(3)}cm`;

const CHART_CLASS: Record<HeldChartType, string> = {
  column: 'chart:bar',
  bar: 'chart:bar',
  line: 'chart:line',
  area: 'chart:area',
  scatter: 'chart:scatter',
  bubble: 'chart:bubble',
  pie: 'chart:circle',
  doughnut: 'chart:ring',
  radar: 'chart:radar',
  // A Combo chart is a bar chart whose series name their own classes (D287).
  combo: 'chart:bar',
};

// A Combo series' own class (D287).
const SERIES_CLASS = { column: 'chart:bar', line: 'chart:line', area: 'chart:area' } as const;

/** A sheet name as an ODF address starts it: always quoted, a quote doubled. */
const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`;

const cellOf = (sheet: string, r: number, c: number) =>
  `${quoted(sheet)}.${columnLetters(c)}${r + 1}`;
export const odfRange = (sheet: string, at: FileRange) =>
  `${cellOf(sheet, at.r1, at.c1)}:${cellOf(sheet, at.r2, at.c2)}`;

/**
 * The frames of a sheet's charts by the cell each is anchored in (`r,c`), in paint order, each at its offset into
 * that cell (LibreOffice's "To cell", D280) and naming its object by `objects[n]`.
 */
export function odsChartFrames(
  charts: readonly FileChart[],
  sheet: string,
  // Each chart's object: a package's folder name, or a flat file's inline document.
  objects: readonly ({ href: string } | { inline: string })[],
): Map<string, string> {
  const frames = new Map<string, string>();
  charts.forEach((chart, i) => {
    const ranges = [
      ...(chart.labels ? [chart.labels.range] : []),
      ...(chart.x ? [chart.x.range] : []),
    ]
      .concat(chart.series.map((s) => s.values))
      .concat(chart.sizes ? [chart.sizes.range] : [])
      .map((r) => odfRange(sheet, r))
      .join(' ');
    const notify = ranges ? ` draw:notify-on-update-of-ranges="${escapeXmlAttribute(ranges)}"` : '';
    const alt = chart.alt ?? chart.title;
    const frame = [
      `<draw:frame draw:z-index="${i}" draw:name="Chart ${i + 1}" svg:x="${cm(chart.at.dx)}" svg:y="${cm(chart.at.dy)}" svg:width="${cm(chart.width)}" svg:height="${cm(chart.height)}">`,
      objectXml(objects[i]!, notify),
      alt ? `<svg:title>${escapeXmlText(alt)}</svg:title>` : '',
      '</draw:frame>',
    ].join('');
    const at = `${chart.at.r},${chart.at.c}`;
    frames.set(at, (frames.get(at) ?? '') + frame);
  });
  return frames;
}

function objectXml(object: { href: string } | { inline: string }, notify: string): string {
  return 'href' in object
    ? `<draw:object${notify} xlink:href="./${object.href}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>`
    : `<draw:object${notify}>${object.inline}</draw:object>`;
}

const paragraph = (text: string) => `<text:p>${escapeXmlText(text)}</text:p>`;

function seriesStyle(chart: HeldFileChart, s: FileChartSeries, name: string): string | null {
  const chartProps: string[] = [];
  const graphic: string[] = [];
  // A Combo series looks as its own type does.
  const type = chart.type === 'combo' ? (s.type ?? 'column') : chart.type;
  if (type === 'line') chartProps.push('chart:symbol-type="none"');
  // A radar's points carry markers (D292).
  if (type === 'radar') chartProps.push('chart:symbol-type="automatic"');
  if (chart.type === 'scatter') {
    chartProps.push('chart:symbol-type="automatic"');
    if (!s.line) graphic.push('draw:stroke="none"');
  }
  if (chart.values) chartProps.push('chart:data-label-number="value"');
  if (s.color && chart.type !== 'pie' && chart.type !== 'doughnut')
    graphic.push(`draw:fill-color="${s.color}"`, `svg:stroke-color="${s.color}"`);
  if (!chartProps.length && !graphic.length) return null;
  return `<style:style style:name="${name}" style:family="chart">${chartProps.length ? `<style:chart-properties ${chartProps.join(' ')}/>` : ''}${graphic.length ? `<style:graphic-properties ${graphic.join(' ')}/>` : ''}</style:style>`;
}

/** The name of the user-defined property a chart object's metadata keeps its original in (D290). */
export const ODS_CHART_ORIGINAL = 'LiveDoc chart';

/** A chart object's `office:meta` holding its original (D290). */
const originalMeta = (original: ChartOriginal) =>
  `<office:meta><meta:user-defined meta:name="${ODS_CHART_ORIGINAL}" meta:value-type="string">${escapeXmlText(chartOriginalText(original))}</meta:user-defined></office:meta>`;

/** A package's chart object's `meta.xml`, for a chart written as its nearest type; none for another (D290). */
export function odsChartMeta(chart: FileChart): string | null {
  const { original } = nearestFileChart(chart);
  if (!original) return null;
  const ns = (['office', 'meta'] as const).map((p) => `xmlns:${p}="${ODF_NS[p]}"`).join(' ');
  return `<office:document-meta ${ns} office:version="${ODF_VERSION}">${originalMeta(original)}</office:document-meta>`;
}

/**
 * One chart's own document (`content.xml` of its object, or inline in a flat file): its series read `sheet`; a type no
 * file holds as the nearest that does, a flat file's inline document keeping the original in its metadata (D290).
 */
export function odsChartContent(
  sheet: string,
  own: FileChart,
  root: 'document-content' | 'document',
): string {
  const { chart, original } = nearestFileChart(own);
  const styles: string[] = [];
  const style = (xml: string | null, name: string) => {
    if (!xml) return '';
    styles.push(xml);
    return ` chart:style-name="${name}"`;
  };
  const round = chart.type === 'pie' || chart.type === 'doughnut';
  // A bar chart lies on its side; a stacking stacks (D283); a smooth line curves (D285).
  const plotProps = [
    ...(chart.type === 'bar' ? ['chart:vertical="true"'] : []),
    ...(chart.stack === 'stacked' ? ['chart:stacked="true"'] : []),
    ...(chart.stack === 'percent' ? ['chart:percentage="true"'] : []),
    // A smooth line (D285).
    ...(chart.smooth ? ['chart:interpolation="cubic-spline"'] : []),
  ];
  const plotStyle = style(
    plotProps.length
      ? `<style:style style:name="plot" style:family="chart"><style:chart-properties ${plotProps.join(' ')}/></style:style>`
      : null,
    'plot',
  );
  // A shown axis says so: LibreOffice reads an axis that does not as one without labels (D279).
  const shownAxis = round
    ? ''
    : style(
        '<style:style style:name="axis" style:family="chart"><style:chart-properties chart:display-label="true"/></style:style>',
        'axis',
      );
  const hiddenAxis = chart.axis
    ? shownAxis
    : style(
        '<style:style style:name="hidden-axis" style:family="chart"><style:chart-properties chart:display-label="false"/><style:graphic-properties draw:stroke="none"/></style:style>',
        'hidden-axis',
      );
  const series = chart.series.map((s, i) => {
    const own = style(seriesStyle(chart, s, `series${i + 1}`), `series${i + 1}`);
    const label = s.nameAt
      ? ` chart:label-cell-address="${escapeXmlAttribute(cellOf(sheet, s.nameAt.r, s.nameAt.c))}"`
      : '';
    const domainOf = (range: FileRange) =>
      `<chart:domain table:cell-range-address="${escapeXmlAttribute(odfRange(sheet, range))}"/>`;
    const x = chart.x ? domainOf(chart.x.range) : '';
    // A bubble series' values are its sizes, its domains its y and then its x (ODF 1.3 Part 3 §11.13, D321).
    const bubble = chart.type === 'bubble' ? chart.sizes : undefined;
    const domain = bubble ? domainOf(s.values) + x : x;
    const values = bubble ? bubble.range : s.values;
    const ownClass =
      chart.type === 'combo' && s.type ? ` chart:class="${SERIES_CLASS[s.type]}"` : '';
    // A series on the right-hand axis names the secondary one (D288).
    const attached = s.right ? ' chart:attached-axis="secondary-y"' : '';
    return `<chart:series${ownClass}${attached} chart:values-cell-range-address="${escapeXmlAttribute(odfRange(sheet, values))}"${label}${own}>${domain}</chart:series>`;
  });
  const categories = chart.labels
    ? `<chart:categories table:cell-range-address="${escapeXmlAttribute(odfRange(sheet, chart.labels.range))}"/>`
    : '';
  // A round chart's labels are its x axis's categories, an axis no suite draws.
  const axes = round
    ? categories &&
      `<chart:axis chart:dimension="x" chart:name="primary-x">${categories}</chart:axis>`
    : [
        `<chart:axis chart:dimension="x" chart:name="primary-x"${shownAxis}>${chart.xTitle ? `<chart:title>${paragraph(chart.xTitle)}</chart:title>` : ''}${categories}</chart:axis>`,
        `<chart:axis chart:dimension="y" chart:name="primary-y"${hiddenAxis}>${chart.yTitle ? `<chart:title>${paragraph(chart.yTitle)}</chart:title>` : ''}<chart:grid chart:class="major"/></chart:axis>`,
        chart.series.some((s) => s.right)
          ? `<chart:axis chart:dimension="y" chart:name="secondary-y"${hiddenAxis}/>`
          : '',
      ].join('');
  const legend =
    chart.legend === 'none'
      ? ''
      : `<chart:legend chart:legend-position="${chart.legend === 'left' ? 'start' : chart.legend === 'right' ? 'end' : chart.legend}"/>`;
  const title = chart.title ? `<chart:title>${paragraph(chart.title)}</chart:title>` : '';
  const ns = (['office', 'style', 'text', 'table', 'draw', 'svg', 'chart', 'xlink'] as const)
    .map((p) => `xmlns:${p}="${ODF_NS[p]}"`)
    .join(' ');
  const mimetype = root === 'document' ? ` office:mimetype="${CHART_MEDIA_TYPE}"` : '';
  // A flat file's object is inline in its frame, so it declares nothing its file root does.
  const declared = root === 'document' ? '' : ` ${ns}`;
  return [
    `<office:${root}${declared}${mimetype} office:version="${ODF_VERSION}">`,
    original && root === 'document' ? originalMeta(original) : '',
    styles.length ? `<office:automatic-styles>${styles.join('')}</office:automatic-styles>` : '',
    '<office:body><office:chart>',
    `<chart:chart svg:width="${cm(chart.width)}" svg:height="${cm(chart.height)}" chart:class="${CHART_CLASS[chart.type]}">`,
    title,
    legend,
    `<chart:plot-area${plotStyle}>${axes}${series.join('')}</chart:plot-area>`,
    '</chart:chart>',
    '</office:chart></office:body>',
    `</office:${root}>`,
  ].join('');
}

/** The kept entries a read chart's document is found among (the file's kept content, ODF's alone). */
export type OdsKeptParts = { part(name: string): KeptPart | undefined };

// A kept document's form: a package's `content.xml` (`office:document-content`), or a flat file's inline one.
const PACKAGE_DOCUMENT = /^(?:<\?xml[^>]*\?>\s*)?<[\w.-]+:document-content\b/;

/** The chart objects a written file holds: named past the objects the file kept, inline in a flat file. */
export class OdsChartObjects {
  readonly entries: { name: string; mediaType: string; data: Uint8Array }[] = [];
  private n = 0;

  private readonly flat: boolean;
  // The object folders the file kept (`Object 1`), which no new object is named.
  private readonly taken: ReadonlySet<string>;
  private readonly kept: OdsKeptParts;
  private readonly losses: FileLoss[];

  constructor(flat: boolean, taken: ReadonlySet<string>, kept: OdsKeptParts, losses: FileLoss[]) {
    this.flat = flat;
    this.taken = new Set([...taken].map((name) => name.split('/')[0]!));
    this.kept = kept;
    this.losses = losses;
  }

  // A read chart's kept document, while it sums as it was read and is written to the form it was read from (D278); a
  // chart changed since, or written to the other form, is written anew and its sheet named.
  private keptDocument(sheet: string, chart: FileChart): { xml: string; part: KeptPart } | null {
    const part = chart.kept && this.kept.part(chart.kept.part);
    if (!part) return null;
    const xml = new TextDecoder().decode(part.data);
    if (fileChartSum(chart) === chart.kept!.sum && PACKAGE_DOCUMENT.test(xml) !== this.flat)
      return { xml, part };
    this.losses.push({ k: 'chart_rewritten', sheet });
    return null;
  }

  /** A sheet's chart frames by the cell each is anchored in (`r,c`). */
  frames(sheet: string, charts: readonly FileChart[]): Map<string, string> {
    const objects = charts.map((chart) => {
      const own = this.keptDocument(sheet, chart);
      // A type no format holds is written as the nearest, and named (D290).
      if (nearestFileChart(chart).original) this.losses.push({ k: 'chart_nearest_type', sheet });
      if (this.flat)
        return {
          inline: own
            ? own.xml.replace(/^<\?xml[^>]*\?>\s*/, '')
            : odsChartContent(sheet, chart, 'document'),
        };
      let name: string;
      do name = `Object ${++this.n}`;
      while (this.taken.has(name));
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${odsChartContent(sheet, chart, 'document-content')}\n`;
      const styles = own && this.kept.part(own.part.name.replace(/content\.xml$/, 'styles.xml'));
      const meta = odsChartMeta(chart);
      this.entries.push(
        { name: `${name}/`, mediaType: CHART_MEDIA_TYPE, data: new Uint8Array() },
        {
          name: `${name}/content.xml`,
          mediaType: 'text/xml',
          data: own ? own.part.data : new TextEncoder().encode(xml),
        },
        ...(styles
          ? [{ name: `${name}/styles.xml`, mediaType: 'text/xml', data: styles.data }]
          : []),
        ...(meta
          ? [
              {
                name: `${name}/meta.xml`,
                mediaType: 'text/xml',
                data: new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>\n${meta}\n`),
              },
            ]
          : []),
      );
      return { href: name };
    });
    return odsChartFrames(charts, sheet, objects);
  }
}
