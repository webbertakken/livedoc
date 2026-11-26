// A sheet's charts read from ODF (docs/specs/029-sheets/standard-mapping.md "Charts in the file", Reading, D277, D278):
// when every drawing a sheet kept, in its `table:shapes` and in its cells, is a frame of one chart object of a type
// built reading one block of its own sheet, they become the sheet's charts; the drawings leave the kept content, and
// each chart's document stays kept, named on its chart with the sum of what it was read as, to be written back in its
// place while the chart sums the same. Any other drawing keeps every drawing of its sheet. The look is read as
// `ods-charts.ts` writes it, and as LibreOffice does.
import {
  attributeOf,
  childElement,
  childElements,
  keptXmlOf,
  keptXmlWithin,
  ODF_MEDIA_TYPES,
  ODF_NS,
  parseXml,
  textContent,
  type XmlElement,
  type XmlParsed,
} from '@livedoc/office-packages';
import { columnIndex } from '../address';
import { COLUMN_WIDTH_NEW, ROW_HEIGHT_NEW } from '../limits';
import {
  OBJECT_OFFSET_MAX,
  SHEET_CHART_ALT_MAX,
  SHEET_CHART_SIZE_MAX,
  SHEET_CHART_SIZE_MIN,
  SHEET_CHART_TEXT_MAX,
  type SheetChartLegend,
  type SheetChartType,
} from '../objects/sheet-objects';
import { SheetLimits } from '../sheet-limits';
import {
  fileChartSum,
  isOneBlock,
  type FileChart,
  type FileChartSeries,
  type FileRange,
} from './file-charts';
import { lineAtPx } from './file-lines';
import type { FileAt, KeptContent, KeptItem, KeptPart } from './kept-content';
import type { FileSheet } from './workbook-file';

const {
  office: OFFICE,
  style: STYLE,
  table: TABLE,
  draw: DRAW,
  svg: SVG,
  chart: CHART,
  xlink: XLINK,
  text: TEXT,
} = ODF_NS;

const CLASSES: Readonly<Record<string, SheetChartType>> = {
  bar: 'column',
  line: 'line',
  area: 'area',
  scatter: 'scatter',
  circle: 'pie',
  ring: 'doughnut',
};

const LEGENDS: Readonly<Record<string, SheetChartLegend>> = {
  start: 'left',
  end: 'right',
  top: 'top',
  bottom: 'bottom',
  'top-start': 'top',
  'top-end': 'top',
  'bottom-start': 'bottom',
  'bottom-end': 'bottom',
};

// Px per unit, a pixel a 96th of an inch (D166).
const PX_PER: Readonly<Record<string, number>> = {
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  in: 96,
  pt: 4 / 3,
  pc: 16,
  px: 1,
};

/** An ODF length (`2.5cm`, `3.1252in`) in px, or null when it is none. */
export function odfLengthPx(text: string | undefined): number | null {
  const m = /^\s*(-?(?:\d+\.?\d*|\.\d+))(cm|mm|in|pt|pc|px)\s*$/.exec(text ?? '');
  return m ? Number(m[1]) * PX_PER[m[2]!]! : null;
}

type Ref = { sheet: string; range: FileRange };

// One end of an address: `$Models.$B$2`, `'My sheet'.B2`, or `.B20` (the sheet of the first end).
const END = String.raw`\$?(?:'((?:[^']|'')*)'|([^.'\s:$]*))\.\$?([A-Za-z]{1,3})\$?(\d+)`;
const ADDRESS = new RegExp(`^${END}(?::${END})?$`);

/** An ODF cell or range address (`Models.B2:Models.B4`, `Sheet1.$B$2:.$B$20`): its sheet and block, zero-based. */
export function parseOdfRef(text: string): Ref | null {
  const m = ADDRESS.exec(text.trim());
  if (!m) return null;
  const sheetOf = (quoted: string | undefined, bare: string | undefined) =>
    quoted !== undefined ? quoted.replace(/''/g, "'") : bare!;
  const sheet = sheetOf(m[1], m[2]);
  if (!sheet) return null;
  const r1 = Number(m[4]) - 1;
  const c1 = columnIndex(m[3]!.toUpperCase());
  if (m[7] === undefined) return { sheet, range: { r1, c1, r2: r1, c2: c1 } };
  const other = sheetOf(m[5], m[6]);
  if (other && other !== sheet) return null;
  const r2 = Number(m[8]) - 1;
  const c2 = columnIndex(m[7].toUpperCase());
  return {
    sheet,
    range: {
      r1: Math.min(r1, r2),
      c1: Math.min(c1, c2),
      r2: Math.max(r1, r2),
      c2: Math.max(c1, c2),
    },
  };
}

const kids = (el: XmlElement | undefined, uri: string, local: string) =>
  el ? childElements(el).filter((e) => e.uri === uri && e.local === local) : [];

// A chart document's styles by name: its automatic styles and, inline in a flat file, its common ones.
function stylesOf(root: XmlElement): Map<string, XmlElement> {
  const out = new Map<string, XmlElement>();
  for (const holder of ['styles', 'automatic-styles'])
    for (const style of kids(childElement(root, OFFICE, holder), STYLE, 'style')) {
      const name = attributeOf(style, STYLE, 'name');
      if (name) out.set(name, style);
    }
  return out;
}

type Props = (
  el: XmlElement | undefined,
  kind: 'chart' | 'graphic',
  local: string,
) => string | undefined;

// A property of an element's style: `chart:*` of its chart properties, `draw:*` or `svg:*` of its graphic ones.
function propsOf(styles: ReadonlyMap<string, XmlElement>): Props {
  return (el, kind, local) => {
    const style = el && styles.get(attributeOf(el, CHART, 'style-name') ?? '');
    const props = style && childElement(style, STYLE, `${kind}-properties`);
    if (!props) return undefined;
    if (kind === 'chart') return attributeOf(props, CHART, local);
    return attributeOf(props, DRAW, local) ?? attributeOf(props, SVG, local);
  };
}

// A `chart:class` value's own name (`chart:bar` -> `bar`), its prefix the chart namespace's.
function classOf(el: XmlElement): string | undefined {
  const value = attributeOf(el, CHART, 'class');
  const at = value?.indexOf(':') ?? -1;
  if (!value || at < 0 || el.scope[value.slice(0, at)] !== CHART) return undefined;
  return value.slice(at + 1);
}

// A title's paragraphs as one line.
function titleOf(el: XmlElement | undefined): string | undefined {
  const text = kids(el, TEXT, 'p')
    .map((p) => textContent(p).trim())
    .filter(Boolean)
    .join(' ');
  return text ? text.slice(0, SHEET_CHART_TEXT_MAX) : undefined;
}

const colourOf = (value: string | undefined) =>
  value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;

// A series' own look, as the writer gives it (ods-charts.ts `seriesStyle`) and LibreOffice does.
function lookOf(
  type: SheetChartType,
  ser: XmlElement,
  props: Props,
): Pick<FileChartSeries, 'color' | 'line'> {
  if (type === 'pie' || type === 'doughnut') return {};
  const stroke = colourOf(props(ser, 'graphic', 'stroke-color'));
  const fill = colourOf(props(ser, 'graphic', 'fill-color'));
  if (type === 'scatter') {
    const line = props(ser, 'graphic', 'stroke') !== 'none';
    const color = line ? stroke : fill;
    return { ...(color ? { color } : {}), ...(line ? { line: true as const } : {}) };
  }
  const color = type === 'line' ? stroke : fill;
  return color ? { color } : {};
}

type Read = Omit<FileChart, 'at' | 'width' | 'height' | 'alt' | 'kept'>;

// What a plot or a series says that the model cannot draw: stacked, 3-D or smoothed.
const unbuilt = (el: XmlElement, props: Props) =>
  ['stacked', 'percentage', 'three-dimensional', 'deep'].some(
    (local) => props(el, 'chart', local) === 'true',
  ) || !['none', undefined].includes(props(el, 'chart', 'interpolation'));

/** One chart document (its `office:document-content`, or a flat file's inline `office:document`), or null (D277). */
export function readOdsChartDocument(root: XmlElement, sheetName: string): Read | null {
  const chart = childElement(
    childElement(childElement(root, OFFICE, 'body') ?? root, OFFICE, 'chart') ?? root,
    CHART,
    'chart',
  );
  const plot = chart && childElement(chart, CHART, 'plot-area');
  const kind = chart && classOf(chart);
  if (!chart || !plot || !kind || !CLASSES[kind]) return null;
  const props = propsOf(stylesOf(root));
  if (unbuilt(plot, props)) return null;
  const vertical = props(plot, 'chart', 'vertical') === 'true';
  const type: SheetChartType = kind === 'bar' && vertical ? 'bar' : CLASSES[kind];
  const round = type === 'pie' || type === 'doughnut';
  const scatter = type === 'scatter';
  const own = (address: string | undefined): FileRange | null => {
    const read = address === undefined ? null : parseOdfRef(address);
    return read && read.sheet.toLowerCase() === sheetName.toLowerCase() ? read.range : null;
  };
  const axes = kids(plot, CHART, 'axis');
  const axisOf = (dimension: string) =>
    axes.find((x) => attributeOf(x, CHART, 'dimension') === dimension);
  // Only the primary x and y axes: a secondary or a depth axis is a chart not built.
  if (
    !round &&
    axes.some(
      (x) =>
        !['x', 'y'].includes(attributeOf(x, CHART, 'dimension')!) ||
        !/^primary-|^$/.test(attributeOf(x, CHART, 'name') ?? ''),
    )
  )
    return null;
  const xAxis = axisOf('x');
  const yAxis = axisOf('y');
  const series: FileChartSeries[] = [];
  let x: FileRange | null = null;
  for (const [i, ser] of kids(plot, CHART, 'series').entries()) {
    const own_ = classOf(ser);
    if (own_ !== undefined && own_ !== kind && !(kind === 'ring' && own_ === 'circle')) return null;
    const axis = attributeOf(ser, CHART, 'attached-axis');
    if ((axis && axis !== 'primary-y') || unbuilt(ser, props)) return null;
    const values = own(attributeOf(ser, CHART, 'values-cell-range-address'));
    if (!values) return null;
    const labelAddress = attributeOf(ser, CHART, 'label-cell-address');
    const name = labelAddress === undefined ? null : own(labelAddress);
    if (labelAddress !== undefined && (!name || name.r1 !== name.r2 || name.c1 !== name.c2))
      return null;
    const domains = kids(ser, CHART, 'domain');
    if (domains.length > (scatter ? 1 : 0)) return null;
    const domain = domains[0] && own(attributeOf(domains[0], TABLE, 'cell-range-address'));
    if (domains[0] && !domain) return null;
    // A scatter's x is its first series' domain; a later series names none or the same.
    if (i === 0) x = domain ?? null;
    else if (domain && JSON.stringify(domain) !== JSON.stringify(x)) return null;
    series.push({
      name: '',
      nameAt: name ? { r: name.r1, c: name.c1 } : null,
      values,
      cached: [],
      ...lookOf(type, ser, props),
    });
  }
  if (scatter && !x) return null;
  const categories = xAxis && childElement(xAxis, CHART, 'categories');
  const labels = categories ? own(attributeOf(categories, TABLE, 'cell-range-address')) : null;
  if (categories && !labels) return null;
  if (!isOneBlock(series, scatter ? x : labels)) return null;
  const labelNumber = (ser: XmlElement) =>
    props(ser, 'chart', 'data-label-number') ?? props(plot, 'chart', 'data-label-number');
  const legend = childElement(chart, CHART, 'legend');
  const title = titleOf(childElement(chart, CHART, 'title'));
  // A round chart's axes are drawn by no suite: their titles are none.
  const xTitle = round || !xAxis ? undefined : titleOf(childElement(xAxis, CHART, 'title'));
  const yTitle = round || !yAxis ? undefined : titleOf(childElement(yAxis, CHART, 'title'));
  const axisShown =
    round ||
    (!!yAxis &&
      props(yAxis, 'chart', 'visible') !== 'false' &&
      props(yAxis, 'chart', 'display-label') !== 'false');
  return {
    id: '',
    type,
    ...(title ? { title } : {}),
    ...(xTitle ? { xTitle } : {}),
    ...(yTitle ? { yTitle } : {}),
    legend: legend
      ? (LEGENDS[attributeOf(legend, CHART, 'legend-position') ?? ''] ?? 'right')
      : 'none',
    values: kids(plot, CHART, 'series').every((ser) => labelNumber(ser) === 'value'),
    axis: axisShown,
    labels: labels && !scatter ? { range: labels, cached: [] } : null,
    x: scatter ? { range: x!, cached: [] } : null,
    series,
  };
}

const px = (length: string | undefined) => {
  const n = odfLengthPx(length);
  return n === null ? null : Math.round(n);
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// A frame's place: on its cell, its offset into it; else by its position over the sheet's lines.
function placeOf(
  frame: XmlElement,
  sheet: FileSheet,
  cell: { r: number; c: number } | undefined,
): Pick<FileChart, 'at' | 'width' | 'height'> | null {
  const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((k) =>
    px(attributeOf(frame, SVG, k)),
  );
  if (width == null || height == null) return null;
  let at: FileChart['at'];
  if (cell) at = { ...cell, dx: x ?? 0, dy: y ?? 0 };
  else {
    const { rows, cols } = SheetLimits.spreadsheet;
    const col = lineAtPx(sheet.lines?.c, x ?? 0, COLUMN_WIDTH_NEW, cols);
    const row = lineAtPx(sheet.lines?.r, y ?? 0, ROW_HEIGHT_NEW, rows);
    at = { r: row.at, c: col.at, dx: col.offset, dy: row.offset };
  }
  return {
    at: {
      r: at.r,
      c: at.c,
      dx: clamp(Math.round(at.dx), 0, OBJECT_OFFSET_MAX),
      dy: clamp(Math.round(at.dy), 0, OBJECT_OFFSET_MAX),
    },
    width: clamp(width, SHEET_CHART_SIZE_MIN.width, SHEET_CHART_SIZE_MAX),
    height: clamp(height, SHEET_CHART_SIZE_MIN.height, SHEET_CHART_SIZE_MAX),
  };
}

// A drawing kept on a sheet: the item holding it, its parsed XML, and its element, with its cell when in one.
type Drawing = {
  item: KeptItem<FileAt>;
  parsed: XmlParsed;
  element: XmlElement;
  cell?: { r: number; c: number };
};

const parsedItem = (item: KeptItem<FileAt>) => {
  const parsed = parseXml(keptXmlWithin(item, {}));
  return parsed.ok ? parsed : null;
};

// The drawings of a sheet's kept items, or null when one of them does not parse.
function drawingsOf(items: readonly KeptItem<FileAt>[], sheet: number): Drawing[] | null {
  const out: Drawing[] = [];
  for (const item of items) {
    if (item.at.sheet !== sheet) continue;
    const prefix = /^<([\w.-]+):/.exec(item.xml)?.[1];
    const isShapes =
      /^table-(before|after)$/.test(item.place) && /^<[\w.-]+:shapes\b/.test(item.xml);
    const inCell = /^cell(-after)?$/.test(item.place) && prefix && item.ns[prefix] === DRAW;
    if (!isShapes && !inCell) continue;
    const parsed = parsedItem(item);
    if (!parsed) return null;
    if (inCell) {
      out.push({ item, parsed, element: parsed.root, cell: { r: item.at.r!, c: item.at.c! } });
      continue;
    }
    if (parsed.root.uri !== TABLE) continue;
    for (const element of childElements(parsed.root)) out.push({ item, parsed, element });
  }
  return out;
}

// The entries of an embedded chart object a chart may name: what LibreOffice writes in its folder.
const OBJECT_ENTRIES: ReadonlySet<string> = new Set(['', 'content.xml', 'styles.xml', 'meta.xml']);
const FRAME_CHILDREN: ReadonlySet<string> = new Set([
  `${DRAW} object`,
  `${DRAW} image`,
  `${SVG} title`,
  `${SVG} desc`,
]);

const decode = (data: Uint8Array) => new TextDecoder().decode(data);

type Found = {
  chart: FileChart;
  // The kept part holding its document: a package's, or a flat file's made from the inline one.
  part: KeptPart;
  // A package's object entries the chart no longer names (its folder, meta, replacement picture).
  gone: string[];
};

// One drawing's chart, or null when it is not a chart frame that qualifies.
function chartOf(
  drawing: Drawing,
  sheet: FileSheet,
  parts: ReadonlyMap<string, KeptPart>,
  flatName: () => string,
): Found | null {
  const frame = drawing.element;
  if (frame.uri !== DRAW || frame.local !== 'frame') return null;
  const children = childElements(frame);
  if (children.some((e) => !FRAME_CHILDREN.has(`${e.uri} ${e.local}`))) return null;
  const objects = kids(frame, DRAW, 'object');
  if (objects.length !== 1) return null;
  const object = objects[0]!;
  const href = attributeOf(object, XLINK, 'href');
  const inline = childElement(object, OFFICE, 'document');
  let root: XmlElement;
  let part: KeptPart;
  let gone: string[] = [];
  if (href !== undefined) {
    const name = href.replace(/^\.\//, '').replace(/\/$/, '');
    const folder = `${name}/`;
    const inFolder = [...parts.keys()].filter((n) => n.startsWith(folder));
    if (inFolder.some((n) => !OBJECT_ENTRIES.has(n.slice(folder.length)))) return null;
    const content = parts.get(`${folder}content.xml`);
    const parsed = content && parseXml(decode(content.data));
    if (!parsed || !parsed.ok) return null;
    root = parsed.root;
    part = content!;
    gone = [folder, `${folder}meta.xml`, `ObjectReplacements/${name}`];
  } else if (inline) {
    root = inline;
    const xml = keptXmlWithin(keptXmlOf(drawing.parsed, inline), {});
    part = {
      name: flatName(),
      type: ODF_MEDIA_TYPES.chart,
      data: new TextEncoder().encode(xml),
      rels: [],
    };
  } else return null;
  const read = readOdsChartDocument(root, sheet.name);
  const place = read && placeOf(frame, sheet, drawing.cell);
  if (!read || !place) return null;
  const text = (local: string) => {
    const el = childElement(frame, SVG, local);
    return el ? textContent(el).trim() : '';
  };
  const alt = text('desc') || text('title');
  const chart: FileChart = {
    ...read,
    ...place,
    ...(alt && alt !== read.title ? { alt: alt.slice(0, SHEET_CHART_ALT_MAX) } : {}),
  };
  return { chart: { ...chart, kept: { part: part.name, sum: fileChartSum(chart) } }, part, gone };
}

/**
 * The sheets with the charts their kept drawings hold, and the kept content without those drawings (D277); a sheet
 * any of whose drawings does not qualify keeps them all.
 */
export function readOdsCharts(
  sheets: readonly FileSheet[],
  kept: KeptContent<FileAt> | undefined,
): { sheets: FileSheet[]; kept: KeptContent<FileAt> | undefined } {
  if (!kept) return { sheets: [...sheets], kept };
  const parts = new Map(kept.parts.map((p) => [p.name, p]));
  const taken = new Set(kept.parts.map((p) => p.name.split('/')[0]));
  let n = 0;
  const flatName = () => {
    let name: string;
    do name = `Object ${++n}`;
    while (taken.has(name));
    taken.add(name);
    return `${name}/content.xml`;
  };
  let items = kept.items;
  let keptParts = kept.parts;
  const out = sheets.map((sheet, i) => {
    const drawings = drawingsOf(kept.items, i);
    if (!drawings?.length) return sheet;
    // A frame in a repeated cell is on each of its cells: no chart is read twice.
    const seen = new Set<string>();
    const found: Found[] = [];
    for (const drawing of drawings) {
      const key = drawing.parsed.source.slice(drawing.element.start, drawing.element.end);
      const chart = !seen.has(key) && chartOf(drawing, sheet, parts, flatName);
      seen.add(key);
      if (!chart) return sheet;
      found.push(chart);
    }
    const used = new Set(drawings.map((d) => d.item));
    items = items.filter((it) => !used.has(it));
    const gone = new Set(found.flatMap((f) => f.gone));
    keptParts = [
      ...keptParts.filter((p) => !gone.has(p.name)),
      ...found.map((f) => f.part).filter((p) => !parts.has(p.name)),
    ];
    return { ...sheet, charts: found.map((f) => f.chart) };
  });
  return { sheets: out, kept: { ...kept, items, parts: keptParts } };
}
