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
import { fileChartSum, type FileChart, type FileChartSeries, type FileRange } from './file-charts';
import type { KeptPart } from './kept-content';
import type { FileLoss } from './workbook-file';

const CHART_MEDIA_TYPE = ODF_MEDIA_TYPES.chart;

// A px at 100% in centimetres (96 px to the inch).
const CM_PER_PX = 2.54 / 96;
const cm = (px: number) => `${(px * CM_PER_PX).toFixed(3)}cm`;

const CHART_CLASS: Record<FileChart['type'], string> = {
  column: 'chart:bar',
  bar: 'chart:bar',
  line: 'chart:line',
  area: 'chart:area',
  scatter: 'chart:scatter',
  pie: 'chart:circle',
  doughnut: 'chart:ring',
};

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

function seriesStyle(chart: FileChart, s: FileChartSeries, name: string): string | null {
  const chartProps: string[] = [];
  const graphic: string[] = [];
  if (chart.type === 'line') chartProps.push('chart:symbol-type="none"');
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

/** One chart's own document (`content.xml` of its object, or inline in a flat file): its series read `sheet`. */
export function odsChartContent(
  sheet: string,
  chart: FileChart,
  root: 'document-content' | 'document',
): string {
  const styles: string[] = [];
  const style = (xml: string | null, name: string) => {
    if (!xml) return '';
    styles.push(xml);
    return ` chart:style-name="${name}"`;
  };
  const round = chart.type === 'pie' || chart.type === 'doughnut';
  const plotStyle = style(
    chart.type === 'bar'
      ? '<style:style style:name="plot" style:family="chart"><style:chart-properties chart:vertical="true"/></style:style>'
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
    const domain = chart.x
      ? `<chart:domain table:cell-range-address="${escapeXmlAttribute(odfRange(sheet, chart.x.range))}"/>`
      : '';
    return `<chart:series chart:values-cell-range-address="${escapeXmlAttribute(odfRange(sheet, s.values))}"${label}${own}>${domain}</chart:series>`;
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
      );
      return { href: name };
    });
    return odsChartFrames(charts, sheet, objects);
  }
}
