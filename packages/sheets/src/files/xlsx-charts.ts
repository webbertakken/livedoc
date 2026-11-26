// A sheet's charts in XLSX (docs/specs/029-sheets/standard-mapping.md "Charts in the file"): one drawing part per sheet
// with a `oneCellAnchor` per chart, and a DrawingML chart part per chart whose series read the sheet's cells by
// reference, each with a cache of what it showed. Elements in the order ECMA-376's schema asks.
import { escapeXmlAttribute, escapeXmlText } from '@livedoc/office-packages';
import { columnLetters } from '../address';
import type { FileChart, FileChartSeries, FileRange } from './file-charts';

const C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const XDR_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// A px at 100% in English Metric Units.
export const EMU_PER_PX = 9_525;
// The two axes' ids every chart with axes names.
const AXIS_IDS = [500_000_001, 500_000_002] as const;
const LEGEND_POS = { top: 't', right: 'r', bottom: 'b', left: 'l' } as const;
// A stacking's grouping (D283).
export const GROUPING = { stacked: 'stacked', percent: 'percentStacked' } as const;
// A doughnut's hole, as Google draws it: half its size.
const DOUGHNUT_HOLE = 50;

/** A sheet name as a reference starts it: always quoted, a quote doubled. */
export const quotedSheet = (name: string) => `'${name.replace(/'/g, "''")}'`;

const absolute = (r: number, c: number) => `$${columnLetters(c)}$${r + 1}`;
const refOf = (sheet: string, at: FileRange) =>
  `${quotedSheet(sheet)}!${absolute(at.r1, at.c1)}${at.r1 === at.r2 && at.c1 === at.c2 ? '' : `:${absolute(at.r2, at.c2)}`}`;

const val = (name: string, value: string | number) => `<c:${name} val="${value}"/>`;
const rgb = (hex: string) => `<a:srgbClr val="${hex.slice(1).toUpperCase()}"/>`;

function rich(text: string): string {
  return `<c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${escapeXmlText(text)}</a:t></a:r></a:p></c:rich></c:tx>`;
}

function title(text: string | undefined): string {
  return text ? `<c:title>${rich(text)}${val('overlay', 0)}</c:title>` : '';
}

function strRef(f: string, cached: readonly string[]): string {
  const points = cached.map((v, i) => `<c:pt idx="${i}"><c:v>${escapeXmlText(v)}</c:v></c:pt>`);
  return `<c:strRef><c:f>${escapeXmlText(f)}</c:f><c:strCache><c:ptCount val="${cached.length}"/>${points.join('')}</c:strCache></c:strRef>`;
}

function numRef(f: string, cached: readonly (number | null)[]): string {
  const points = cached.flatMap((v, i) =>
    v === null ? [] : [`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`],
  );
  return `<c:numRef><c:f>${escapeXmlText(f)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${cached.length}"/>${points.join('')}</c:numCache></c:numRef>`;
}

function seriesName(sheet: string, s: FileChartSeries): string {
  return s.nameAt
    ? `<c:tx>${strRef(refOf(sheet, { r1: s.nameAt.r, c1: s.nameAt.c, r2: s.nameAt.r, c2: s.nameAt.c }), [s.name])}</c:tx>`
    : `<c:tx><c:v>${escapeXmlText(s.name)}</c:v></c:tx>`;
}

// A series' own look: a fill for marks with area, a stroke for lines; a scatter series not drawn as a line has none.
function seriesLook(chart: FileChart, s: FileChartSeries): string {
  const fill = s.color ? `<a:solidFill>${rgb(s.color)}</a:solidFill>` : '';
  switch (chart.type) {
    case 'pie':
    case 'doughnut':
      return '';
    case 'line':
      return fill ? `<c:spPr><a:ln w="28575">${fill}</a:ln></c:spPr>` : '';
    case 'scatter':
      return s.line
        ? `<c:spPr><a:ln w="28575">${fill}</a:ln></c:spPr>`
        : `<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${
            fill ? `<c:marker>${val('symbol', 'circle')}<c:spPr>${fill}</c:spPr></c:marker>` : ''
          }`;
    default:
      return fill ? `<c:spPr>${fill}</c:spPr>` : '';
  }
}

function seriesXml(sheet: string, chart: FileChart, s: FileChartSeries, i: number): string {
  const head = `${val('idx', i)}${val('order', i)}${seriesName(sheet, s)}${seriesLook(chart, s)}`;
  const values = numRef(refOf(sheet, s.values), s.cached);
  if (chart.type === 'scatter') {
    const x = chart.x
      ? `<c:xVal>${numRef(refOf(sheet, chart.x.range), chart.x.cached)}</c:xVal>`
      : chart.labels
        ? `<c:xVal>${strRef(refOf(sheet, chart.labels.range), chart.labels.cached)}</c:xVal>`
        : '';
    return `<c:ser>${head}${x}<c:yVal>${values}</c:yVal>${val('smooth', 0)}</c:ser>`;
  }
  const cat = chart.labels
    ? `<c:cat>${strRef(refOf(sheet, chart.labels.range), chart.labels.cached)}</c:cat>`
    : '';
  const marker = chart.type === 'line' ? `<c:marker>${val('symbol', 'none')}</c:marker>` : '';
  // A line series' marker sits between its look and its categories.
  const shaped = chart.type === 'line' ? head + marker : head;
  const tail = chart.type === 'line' ? val('smooth', 0) : '';
  const invert = chart.type === 'column' || chart.type === 'bar' ? val('invertIfNegative', 0) : '';
  return `<c:ser>${shaped}${invert}${cat}<c:val>${values}</c:val>${tail}</c:ser>`;
}

function dataLabels(on: boolean): string {
  if (!on) return '';
  const shows = [
    'showLegendKey',
    'showVal',
    'showCatName',
    'showSerName',
    'showPercent',
    'showBubbleSize',
  ];
  return `<c:dLbls>${shows.map((s) => val(s, s === 'showVal' ? 1 : 0)).join('')}</c:dLbls>`;
}

function axisIds(): string {
  return AXIS_IDS.map((id) => val('axId', id)).join('');
}

// The type's own chart element.
function plotXml(sheet: string, chart: FileChart): string {
  const series = chart.series.map((s, i) => seriesXml(sheet, chart, s, i)).join('');
  const labels = dataLabels(chart.values);
  switch (chart.type) {
    case 'column':
    case 'bar':
      // Stacked bars overlap whole, so each category's segments make one bar (D283).
      return `<c:barChart>${val('barDir', chart.type === 'bar' ? 'bar' : 'col')}${val('grouping', chart.stack ? GROUPING[chart.stack] : 'clustered')}${val('varyColors', 0)}${series}${labels}${val('gapWidth', 150)}${chart.stack ? val('overlap', 100) : ''}${axisIds()}</c:barChart>`;
    case 'line':
      return `<c:lineChart>${val('grouping', 'standard')}${val('varyColors', 0)}${series}${labels}${val('marker', 1)}${axisIds()}</c:lineChart>`;
    case 'area':
      return `<c:areaChart>${val('grouping', chart.stack ? GROUPING[chart.stack] : 'standard')}${val('varyColors', 0)}${series}${labels}${axisIds()}</c:areaChart>`;
    case 'scatter':
      return `<c:scatterChart>${val('scatterStyle', 'lineMarker')}${val('varyColors', 0)}${series}${labels}${axisIds()}</c:scatterChart>`;
    case 'pie':
      return `<c:pieChart>${val('varyColors', 1)}${series}${labels}${val('firstSliceAng', 0)}</c:pieChart>`;
    case 'doughnut':
      return `<c:doughnutChart>${val('varyColors', 1)}${series}${labels}${val('firstSliceAng', 0)}${val('holeSize', DOUGHNUT_HOLE)}</c:doughnutChart>`;
  }
}

function axis(
  kind: 'catAx' | 'valAx',
  id: number,
  cross: number,
  pos: 'b' | 'l',
  opts: { title?: string; hidden: boolean; scatter: boolean },
): string {
  const scaling = `<c:scaling>${val('orientation', 'minMax')}</c:scaling>`;
  const grid = kind === 'valAx' && pos === 'l' ? '<c:majorGridlines/>' : '';
  const between = kind === 'valAx' ? val('crossBetween', opts.scatter ? 'midCat' : 'between') : '';
  return `<c:${kind}>${val('axId', id)}${scaling}${val('delete', opts.hidden ? 1 : 0)}${val('axPos', pos)}${grid}${title(opts.title)}${val('majorTickMark', 'out')}${val('minorTickMark', 'none')}${val('tickLblPos', 'nextTo')}${val('crossAx', cross)}${val('crosses', 'autoZero')}${between}</c:${kind}>`;
}

// A chart's axes: its categories (or a scatter's x) and its values; a bar chart lays them on their sides.
function axesXml(chart: FileChart): string {
  if (chart.type === 'pie' || chart.type === 'doughnut') return '';
  const [catId, valId] = AXIS_IDS;
  const scatter = chart.type === 'scatter';
  const side = chart.type === 'bar';
  const cat = axis(scatter ? 'valAx' : 'catAx', catId, valId, side ? 'l' : 'b', {
    ...(chart.xTitle ? { title: chart.xTitle } : {}),
    hidden: false,
    scatter,
  });
  const values = axis('valAx', valId, catId, side ? 'b' : 'l', {
    ...(chart.yTitle ? { title: chart.yTitle } : {}),
    hidden: !chart.axis,
    scatter,
  });
  return cat + values;
}

/** One chart's part: `c:chartSpace` reading the sheet named `sheet` (as the file names it). */
export function xlsxChartXml(sheet: string, chart: FileChart): string {
  const legend =
    chart.legend === 'none'
      ? ''
      : `<c:legend>${val('legendPos', LEGEND_POS[chart.legend])}${val('overlay', 0)}</c:legend>`;
  const heading = chart.title ? title(chart.title) : val('autoTitleDeleted', 1);
  return [
    `<c:chartSpace xmlns:c="${C_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">`,
    val('roundedCorners', 0),
    `<c:chart>${heading}<c:plotArea><c:layout/>${plotXml(sheet, chart)}${axesXml(chart)}</c:plotArea>${legend}${val('plotVisOnly', 1)}${val('dispBlanksAs', 'gap')}</c:chart>`,
    '</c:chartSpace>',
  ].join('');
}

/** A sheet's drawing part: a `oneCellAnchor` per chart, the n-th naming the relationship `chartRelIds[n]`. */
export function xlsxDrawingXml(
  charts: readonly FileChart[],
  chartRelIds: readonly string[],
): string {
  const anchors = charts.map((chart, i) => {
    const name = `Chart ${i + 1}`;
    const descr = chart.alt ?? chart.title;
    const from = `<xdr:from><xdr:col>${chart.at.c}</xdr:col><xdr:colOff>${chart.at.dx * EMU_PER_PX}</xdr:colOff><xdr:row>${chart.at.r}</xdr:row><xdr:rowOff>${chart.at.dy * EMU_PER_PX}</xdr:rowOff></xdr:from>`;
    const cx = chart.width * EMU_PER_PX;
    const cy = chart.height * EMU_PER_PX;
    return [
      '<xdr:oneCellAnchor>',
      from,
      `<xdr:ext cx="${cx}" cy="${cy}"/>`,
      '<xdr:graphicFrame macro="">',
      `<xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${name}"${descr ? ` descr="${escapeXmlAttribute(descr)}"` : ''}/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`,
      `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></xdr:xfrm>`,
      `<a:graphic><a:graphicData uri="${C_NS}"><c:chart xmlns:c="${C_NS}" r:id="${chartRelIds[i]}"/></a:graphicData></a:graphic>`,
      '</xdr:graphicFrame>',
      '<xdr:clientData/>',
      '</xdr:oneCellAnchor>',
    ].join('');
  });
  return `<xdr:wsDr xmlns:xdr="${XDR_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">${anchors.join('')}</xdr:wsDr>`;
}
