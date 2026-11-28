// A sheet's charts and pictures read from XLSX (docs/specs/029-sheets/standard-mapping.md "Charts in the file",
// Reading, D275, D276; "Pictures in the file", D628): the drawing a worksheet kept, when every anchor in it is a chart
// of a type built reading one block of its own sheet, a table slicer, or a picture of bytes the package holds as PNG,
// JPEG, GIF or WebP, becomes the sheet's charts and read pictures; the drawing leaves the kept content, and each
// chart's part stays kept, named on its chart with the sum of what it was read as, to be written back in its place
// while the chart sums the same, while a picture's media part leaves it unless kept content still names it. Any other
// drawing stays kept whole. The look is read as `xlsx-charts.ts` writes it.
import {
  attributeOf,
  childElement,
  childElements,
  parseXml,
  resolvePartName,
  textContent,
  type XmlElement,
} from '@livedoc/office-packages';
import { columnIndex } from '../address';
import { SHEET_IMAGE_ALT_MAX, SHEET_IMAGE_SIZE } from '../objects/sheet-image';
import { COLUMN_WIDTH_NEW, ROW_HEIGHT_NEW } from '../limits';
import {
  OBJECT_OFFSET_MAX,
  SHEET_CHART_ALT_MAX,
  SHEET_CHART_SIZE_MAX,
  SHEET_CHART_SIZE_MIN,
  SHEET_CHART_TEXT_MAX,
  type SheetChartLegend,
  type SheetChartStack,
  type SheetChartType,
  type SheetComboSeriesType,
} from '../objects/sheet-objects';
import {
  fileChartSum,
  isOneBlock,
  sizedBlock,
  type FileChart,
  type FileChartSeries,
  type FileRange,
} from './file-charts';
import { lineStartPx } from './file-lines';
import type { FileAt, KeptContent, KeptPart } from './kept-content';
import { readablePicture, type ReadPicture } from './file-pictures';
import type { FileSheet } from './workbook-file';
import { chartRestored } from './chart-nearest';
import { EMU_PER_PX, GROUPING, LIVEDOC_CHART_NS } from './xlsx-charts';
import { SLICER_SIZE_MIN } from '../objects/sheet-slicer';
import { SLICER_DRAWING_NS } from './xlsx-slicers';

const C_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const XDR_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const LEGENDS: Readonly<Record<string, SheetChartLegend>> = {
  t: 'top',
  r: 'right',
  b: 'bottom',
  l: 'left',
};

type Ref = { sheet: string; range: FileRange };

const c = (el: XmlElement | undefined, local: string) =>
  el ? childElement(el, C_NS, local) : undefined;
const cs = (el: XmlElement, local: string) =>
  childElements(el).filter((e) => e.uri === C_NS && e.local === local);
const a = (el: XmlElement | undefined, local: string) =>
  el ? childElement(el, A_NS, local) : undefined;
const valOf = (el: XmlElement | undefined) => (el ? attributeOf(el, '', 'val') : undefined);
// A CT_Boolean: present and not false (its `val` defaults to true).
const isOn = (el: XmlElement | undefined) => !!el && !['0', 'false'].includes(valOf(el) ?? 'true');

// `'Models'!$B$2:$B$40` or `Models!B2`: the sheet and the block, zero-based.
const REF = /^(?:'((?:[^']|'')+)'|([^'!]+))!\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/;
export function parseXlsxRef(text: string): Ref | null {
  const m = REF.exec(text.trim());
  if (!m) return null;
  const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : m[2]!;
  const r1 = Number(m[4]) - 1;
  const c1 = columnIndex(m[3]!);
  const r2 = m[6] ? Number(m[6]) - 1 : r1;
  const c2 = m[5] ? columnIndex(m[5]) : c1;
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

// A reference's formula under a `strRef` or `numRef`.
function refUnder(el: XmlElement | undefined): string | null {
  const ref = c(el, 'strRef') ?? c(el, 'numRef');
  const f = c(ref, 'f');
  return f ? textContent(f) : null;
}

const colour = (fill: XmlElement | undefined): string | undefined => {
  const hex = valOf(a(a(fill, 'solidFill'), 'srgbClr'));
  return hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : undefined;
};

// A bar or area chart's grouping as its stacking (D283): none for clustered or standard, undefined for one not built.
const stackOf = (grouping: string | undefined, plain: string) =>
  grouping === undefined || grouping === plain
    ? null
    : grouping === GROUPING.stacked
      ? ('stacked' as const)
      : grouping === GROUPING.percent
        ? ('percent' as const)
        : undefined;

// Each chart group of the plot, the type its series draw as (one group, the chart's; a Combo's, its series') and
// whether they sit on the right-hand axis; the right-hand axes' ids.
type Typed = {
  type: SheetChartType;
  groups: { group: XmlElement; as: SheetChartType; right: boolean }[];
  stack?: SheetChartStack;
  rightIds: readonly string[];
};

// The chart's type and stacking, or null for one not built (a stacked line, smooth, 3-D, another mix of groups).
function typeOf(plot: XmlElement): Typed | null {
  const groups = childElements(plot).filter((e) => e.uri === C_NS && e.local.endsWith('Chart'));
  if (groups.length > 1) return severalOf(plot, groups);
  if (groups.length !== 1) return null;
  const one = groupType(groups[0]!);
  return (
    one && {
      type: one.type,
      groups: [{ group: groups[0]!, as: one.type, right: false }],
      ...(one.stack ? { stack: one.stack } : {}),
      rightIds: [],
    }
  );
}

// A plot of several groups, each clustered columns, a standard line or a standard area, unstacked, no kind twice on one
// pair of axes: on one pair, a Combo chart (D287); on two, the second's value axis at the right, its groups' series on
// the right-hand axis, a Line or Area chart when every group is that kind, else a Combo chart (D288).
const COMBO_GROUPS: readonly SheetChartType[] = ['column', 'line', 'area'];
function severalOf(plot: XmlElement, groups: readonly XmlElement[]): Typed | null {
  const pairOf = (g: XmlElement) => cs(g, 'axId').map(valOf).join(' ');
  const pairs = [...new Set(groups.map(pairOf))];
  const atRight = (pair: string) =>
    childElements(plot).some(
      (x) =>
        x.uri === C_NS &&
        x.local === 'valAx' &&
        (pair.split(' ') as (string | undefined)[]).includes(valOf(c(x, 'axId'))) &&
        valOf(c(x, 'axPos')) === 'r',
    );
  const right = pairs.length === 2 ? pairs.filter(atRight) : [];
  if (pairs.length > 2 || right.length !== pairs.length - 1) return null;
  const typed = groups.map((group) => ({
    group,
    read: groupType(group),
    right: pairOf(group) === right[0],
  }));
  if (typed.some((t) => !t.read || t.read.stack || !COMBO_GROUPS.includes(t.read.type)))
    return null;
  const keys = typed.map((t) => `${t.read!.type} ${t.right}`);
  if (new Set(keys).size !== keys.length) return null;
  const kinds = new Set(typed.map((t) => t.read!.type));
  const type = kinds.size === 1 ? typed[0]!.read!.type : 'combo';
  // A column chart draws no right-hand axis.
  if (type === 'column') return null;
  return {
    type,
    groups: typed.map((t) => ({ group: t.group, as: t.read!.type, right: t.right })),
    rightIds: right[0]?.split(' ') ?? [],
  };
}

// One chart group's type and stacking.
function groupType(group: XmlElement): { type: SheetChartType; stack?: SheetChartStack } | null {
  const grouping = valOf(c(group, 'grouping'));
  switch (group.local) {
    case 'barChart':
    case 'areaChart': {
      const stack = stackOf(grouping, group.local === 'barChart' ? 'clustered' : 'standard');
      if (stack === undefined) return null;
      const type =
        group.local === 'areaChart'
          ? 'area'
          : valOf(c(group, 'barDir')) === 'bar'
            ? 'bar'
            : 'column';
      return { type, ...(stack ? { stack } : {}) };
    }
    case 'lineChart':
      if (grouping !== undefined && grouping !== 'standard') return null;
      return { type: 'line' };
    case 'scatterChart':
      return /smooth/i.test(valOf(c(group, 'scatterStyle')) ?? '') ? null : { type: 'scatter' };
    case 'bubbleChart':
      // A 3-D bubble is not built (D321).
      return isOn(c(group, 'bubble3D')) || cs(group, 'ser').some((ser) => isOn(c(ser, 'bubble3D')))
        ? null
        : { type: 'bubble' };
    case 'stockChart': {
      // Three or four price series; four with up-down bars a Candlestick, else OHLC (D323).
      const n = cs(group, 'ser').length;
      if (n < 3 || n > 4) return null;
      return { type: n === 4 && c(group, 'upDownBars') ? 'candlestick' : 'ohlc' };
    }
    case 'radarChart':
      // A filled radar is not built (D292).
      return valOf(c(group, 'radarStyle')) === 'filled' ? null : { type: 'radar' };
    case 'pieChart':
      return { type: 'pie' };
    case 'doughnutChart':
      return { type: 'doughnut' };
    default:
      return null;
  }
}

// A title's text: its runs, else a reference's cached text (never its formula).
function titleOf(el: XmlElement | undefined): string | undefined {
  if (!el) return undefined;
  const runs: string[] = [];
  const values: string[] = [];
  const walk = (e: XmlElement) => {
    for (const child of childElements(e))
      if (child.uri === A_NS && child.local === 't') runs.push(textContent(child));
      else if (child.uri === C_NS && child.local === 'v') values.push(textContent(child));
      else walk(child);
  };
  walk(el);
  const text = (runs.length ? runs : values).join('').trim();
  return text ? text.slice(0, SHEET_CHART_TEXT_MAX) : undefined;
}

// A series' own look, as the writer gives it (xlsx-charts.ts `seriesLook`).
function lookOf(type: SheetChartType, ser: XmlElement): Pick<FileChartSeries, 'color' | 'line'> {
  const sp = c(ser, 'spPr');
  const ln = a(sp, 'ln');
  switch (type) {
    case 'pie':
    case 'doughnut':
      return {};
    case 'line':
    case 'radar': {
      const color = colour(ln);
      return color ? { color } : {};
    }
    case 'candlestick':
    case 'ohlc': {
      // A price series' colour is on its marker (D323).
      const color = colour(c(c(ser, 'marker'), 'spPr'));
      return color ? { color } : {};
    }
    case 'scatter': {
      const line = !!ln && !a(ln, 'noFill');
      const color = line ? colour(ln) : colour(c(c(ser, 'marker'), 'spPr'));
      return { ...(color ? { color } : {}), ...(line ? { line: true as const } : {}) };
    }
    default: {
      const color = colour(sp);
      return color ? { color } : {};
    }
  }
}

// A chart as its part reads, and the original LiveDoc kept in its extension, when it holds one (D290).
type Read = Omit<FileChart, 'at' | 'width' | 'height' | 'alt' | 'kept'> & { original?: string };

// The text of LiveDoc's own extension of a chart part (D290).
function originalOf(root: XmlElement): string | undefined {
  const list = c(root, 'extLst');
  const ext = list && cs(list, 'ext').find((e) => attributeOf(e, '', 'uri') === LIVEDOC_CHART_NS);
  const original = ext && childElement(ext, LIVEDOC_CHART_NS, 'original');
  return original && textContent(original);
}

// One chart part, read as the model holds a chart, or null when it does not qualify (D275).
export function readXlsxChartXml(xml: string, sheetName: string): Read | null {
  // A chart naming parts of its own (user shapes, embedded data) is never read: its XML would name what is not kept.
  if (/\br:id=|:id="rId/.test(xml)) return null;
  const parsed = parseXml(xml);
  if (!parsed.ok) return null;
  const chart = c(parsed.root, 'chart');
  const plot = c(chart, 'plotArea');
  const typed = plot && typeOf(plot);
  if (!chart || !plot || !typed) return null;
  const { type, groups, stack, rightIds } = typed;
  const scatter = type === 'scatter' || type === 'bubble';
  // Every group's series, each with the type it draws as; a Combo's in their order across its groups.
  const order = (ser: XmlElement) => Number(valOf(c(ser, 'order')) ?? 0);
  const sers = groups.flatMap(({ group, as, right }) =>
    cs(group, 'ser').map((ser) => ({ ser, as, right })),
  );
  if (groups.length > 1) sers.sort((x, y) => order(x.ser) - order(y.ser));
  const own = (ref: string | null): FileRange | null => {
    const read = ref === null ? null : parseXlsxRef(ref);
    return read && read.sheet.toLowerCase() === sheetName.toLowerCase() ? read.range : null;
  };
  const series: FileChartSeries[] = [];
  let labels: FileRange | null | undefined;
  // A bubble chart's size column, one shared by every series (D321).
  let sizes: FileRange | null | undefined;
  // A line is smooth when every series says so, straight when none does (D285); another series smoothing is not built.
  const smoothed = sers.map(({ ser, as }) => ({ as, on: cs(ser, 'smooth').some(isOn) }));
  if (smoothed.some((x) => x.on && x.as !== 'line')) return null;
  const lines = smoothed.filter((x) => x.as === 'line');
  const smooth = lines.some((x) => x.on);
  if (smooth && !lines.every((x) => x.on)) return null;
  for (const { ser, as, right } of sers) {
    const values = own(refUnder(c(ser, scatter ? 'yVal' : 'val')));
    if (!values || values.c1 !== values.c2) return null;
    const tx = c(ser, 'tx');
    const nameRef = tx ? own(refUnder(tx)) : null;
    // A name typed in the chart has no cell the model could read it from.
    if (tx && !nameRef) return null;
    const catEl = c(ser, scatter ? 'xVal' : 'cat');
    const cat = catEl ? own(refUnder(catEl)) : null;
    if (catEl && !cat) return null;
    if (labels !== undefined && JSON.stringify(labels) !== JSON.stringify(cat)) return null;
    labels = cat;
    if (type === 'bubble') {
      const size = own(refUnder(c(ser, 'bubbleSize')));
      if (!size || (sizes && JSON.stringify(sizes) !== JSON.stringify(size))) return null;
      sizes = size;
    }
    series.push({
      name: titleOf(tx) ?? '',
      nameAt: nameRef ? { r: nameRef.r1, c: nameRef.c1 } : null,
      values,
      cached: [],
      ...lookOf(as, ser),
      ...(type === 'combo' ? { type: as as SheetComboSeriesType } : {}),
      ...(right ? { right: true as const } : {}),
    });
  }
  if (!isOneBlock(sizedBlock(series, sizes), labels ?? null)) return null;
  // The primary axes: the right-hand pair holds no title nor the value axis's state.
  const axes = childElements(plot).filter(
    (e) =>
      e.uri === C_NS && e.local.endsWith('Ax') && !rightIds.includes(valOf(c(e, 'axId')) ?? ''),
  );
  if (axes.some((x) => x.local === 'serAx')) return null;
  const position = (x: XmlElement) => valOf(c(x, 'axPos'));
  const valueAxis = scatter
    ? axes.find((x) => x.local === 'valAx' && ['l', 'r'].includes(position(x)!))
    : axes.find((x) => x.local === 'valAx');
  const categoryAxis = axes.find((x) => x !== valueAxis);
  const legend = c(chart, 'legend');
  // Values on the marks when every group shows them.
  const values = groups.every(({ group }) => {
    const dLbls = c(group, 'dLbls');
    return !!dLbls && isOn(c(dLbls, 'showVal'));
  });
  const title = titleOf(c(c(chart, 'title'), 'tx'));
  const xTitle = titleOf(c(c(categoryAxis, 'title'), 'tx'));
  const yTitle = titleOf(c(c(valueAxis, 'title'), 'tx'));
  const original = originalOf(parsed.root);
  return {
    id: '',
    type,
    ...(stack ? { stack } : {}),
    ...(smooth ? { smooth: true as const } : {}),
    ...(title ? { title } : {}),
    ...(xTitle ? { xTitle } : {}),
    ...(yTitle ? { yTitle } : {}),
    legend: legend ? (LEGENDS[valOf(c(legend, 'legendPos'))!] ?? 'right') : 'none',
    values,
    axis: !(valueAxis && isOn(c(valueAxis, 'delete'))),
    labels: labels && !scatter ? { range: labels, cached: [] } : null,
    x: labels && scatter ? { range: labels, cached: [] } : null,
    series,
    ...(sizes ? { sizes: { range: sizes, cached: [] } } : {}),
    ...(original === undefined ? {} : { original }),
  };
}

const px = (emu: number) => Math.round(emu / EMU_PER_PX);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type Marker = { r: number; c: number; dx: number; dy: number };
function markerOf(el: XmlElement | undefined): Marker | null {
  const x = (local: string) => {
    const e = el && childElement(el, XDR_NS, local);
    return e ? Number(textContent(e)) : NaN;
  };
  const m = { c: x('col'), dx: px(x('colOff')), r: x('row'), dy: px(x('rowOff')) };
  return Object.values(m).every(Number.isFinite) ? m : null;
}

/** An anchor's cell, offsets and size, as a chart's or a slicer's. */
export type AnchorPlace = Pick<FileChart, 'at' | 'width' | 'height'>;

// Where an anchor puts its chart (or slicer or picture, `min` and `max` its sides' bounds), and its size; null for an
// anchor not on a cell.
function placeOf(
  anchor: XmlElement,
  sheet: FileSheet,
  min: { width: number; height: number } = SHEET_CHART_SIZE_MIN,
  max: number = SHEET_CHART_SIZE_MAX,
): AnchorPlace | null {
  if (!/^(one|two)CellAnchor$/.test(anchor.local)) return null;
  const from = markerOf(childElement(anchor, XDR_NS, 'from'));
  if (!from) return null;
  let width: number;
  let height: number;
  if (anchor.local === 'oneCellAnchor') {
    const ext = childElement(anchor, XDR_NS, 'ext');
    width = px(Number(ext && attributeOf(ext, '', 'cx')));
    height = px(Number(ext && attributeOf(ext, '', 'cy')));
    if (!Number.isFinite(width + height)) return null;
  } else {
    const to = markerOf(childElement(anchor, XDR_NS, 'to'));
    if (!to) return null;
    const x = (m: Marker) => lineStartPx(sheet.lines?.c, m.c, COLUMN_WIDTH_NEW) + m.dx;
    const y = (m: Marker) => lineStartPx(sheet.lines?.r, m.r, ROW_HEIGHT_NEW) + m.dy;
    width = Math.round(x(to) - x(from));
    height = Math.round(y(to) - y(from));
  }
  return {
    at: {
      r: from.r,
      c: from.c,
      dx: clamp(from.dx, 0, OBJECT_OFFSET_MAX),
      dy: clamp(from.dy, 0, OBJECT_OFFSET_MAX),
    },
    width: clamp(width, min.width, max),
    height: clamp(height, min.height, max),
  };
}

const text = (part: KeptPart) => new TextDecoder().decode(part.data);

// An internal relationship's part, by its id on the drawing.
function relPart(
  drawing: KeptPart,
  relId: string | undefined,
  parts: ReadonlyMap<string, KeptPart>,
) {
  const rel = drawing.rels.find((r) => r.id === relId && !r.external);
  const name = rel && resolvePartName(drawing.name, rel.target);
  const part = name ? parts.get(name) : undefined;
  return part && { name: name!, part };
}

const PICTURE_MIN = { width: SHEET_IMAGE_SIZE.min, height: SHEET_IMAGE_SIZE.min };

// The picture an anchor holds, or null when it holds none that qualifies: its bytes a part of the package of a type a
// sheet holds, neither cropped, turned nor flipped (D628).
function pictureOf(
  anchor: XmlElement,
  drawing: KeptPart,
  parts: ReadonlyMap<string, KeptPart>,
  sheet: FileSheet,
): { picture: ReadPicture; part: string } | null {
  const pic = childElement(anchor, XDR_NS, 'pic');
  const fill = pic && childElement(pic, XDR_NS, 'blipFill');
  const blip = a(fill, 'blip');
  if (!blip || attributeOf(blip, R_NS, 'link') !== undefined) return null;
  const crop = a(fill, 'srcRect');
  if (crop && ['l', 't', 'r', 'b'].some((k) => Number(attributeOf(crop, '', k) ?? 0) !== 0))
    return null;
  const xfrm = a(childElement(pic!, XDR_NS, 'spPr'), 'xfrm');
  if (
    xfrm &&
    ['rot', 'flipH', 'flipV'].some(
      (k) => !['0', 'false', undefined].includes(attributeOf(xfrm, '', k)),
    )
  )
    return null;
  const media = relPart(drawing, attributeOf(blip, R_NS, 'embed'), parts);
  const readable = media && readablePicture(media.part.data);
  const place = readable && placeOf(anchor, sheet, PICTURE_MIN, SHEET_IMAGE_SIZE.max);
  if (!place) return null;
  const nv = childElement(pic!, XDR_NS, 'nvPicPr');
  const cNvPr = nv && childElement(nv, XDR_NS, 'cNvPr');
  const alt = (
    cNvPr &&
    (attributeOf(cNvPr, '', 'descr') || attributeOf(cNvPr, '', 'title'))
  )?.trim();
  return {
    picture: {
      ...place,
      bytes: media.part.data,
      ...readable,
      ...(alt ? { alt: alt.slice(0, SHEET_IMAGE_ALT_MAX) } : {}),
    },
    part: media.name,
  };
}

// What an anchor holds besides its object: its place and its client data.
const ANCHOR_PARTS: ReadonlySet<string> = new Set(['from', 'to', 'ext', 'pos', 'clientData']);

const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

// The name of the table slicer an anchor holds in Excel's `mc:AlternateContent` frame; undefined for any other.
function slicerNameOf(anchor: XmlElement): string | undefined {
  const alternate = childElement(anchor, MC_NS, 'AlternateContent');
  const choice = alternate && childElement(alternate, MC_NS, 'Choice');
  const frame = choice && childElement(choice, XDR_NS, 'graphicFrame');
  const data = a(a(frame, 'graphic'), 'graphicData');
  if (!data || attributeOf(data, '', 'uri') !== SLICER_DRAWING_NS) return undefined;
  const slicer = childElement(data, SLICER_DRAWING_NS, 'slicer');
  return slicer && attributeOf(slicer, '', 'name');
}

type Drawn = {
  charts: FileChart[];
  slicers: Map<string, AnchorPlace>;
  pictures: ReadPicture[];
  // The media parts the pictures took.
  media: string[];
};

// A drawing's charts, pictures and its table slicers named in `slicers`, every anchor one that qualifies, or null.
function drawingObjects(
  drawing: KeptPart,
  parts: ReadonlyMap<string, KeptPart>,
  sheet: FileSheet,
  slicerNames: ReadonlySet<string>,
): Drawn | null {
  const parsed = parseXml(text(drawing));
  if (!parsed.ok) return null;
  const charts: FileChart[] = [];
  const slicers = new Map<string, AnchorPlace>();
  const pictures: ReadPicture[] = [];
  const media: string[] = [];
  for (const anchor of childElements(parsed.root)) {
    // An anchor holds one object: a chart's frame, a slicer or a picture, nothing beside it.
    if (childElements(anchor).filter((e) => !ANCHOR_PARTS.has(e.local)).length !== 1) return null;
    if (childElement(anchor, XDR_NS, 'pic')) {
      const read = pictureOf(anchor, drawing, parts, sheet);
      if (!read) return null;
      pictures.push(read.picture);
      media.push(read.part);
      continue;
    }
    const slicer = slicerNameOf(anchor);
    if (slicer !== undefined) {
      const place = slicerNames.has(slicer) && placeOf(anchor, sheet, SLICER_SIZE_MIN);
      if (!place || slicers.has(slicer)) return null;
      slicers.set(slicer, place);
      continue;
    }
    const frame = childElement(anchor, XDR_NS, 'graphicFrame');
    const ref = c(a(a(frame, 'graphic'), 'graphicData'), 'chart');
    const relId = ref && attributeOf(ref, R_NS, 'id');
    const chartPart = relPart(drawing, relId, parts);
    const name = chartPart?.name;
    const read = chartPart && readXlsxChartXml(text(chartPart.part), sheet.name);
    const place = read && placeOf(anchor, sheet);
    if (!read || !place) return null;
    const nv = childElement(frame!, XDR_NS, 'nvGraphicFramePr');
    const cNvPr = nv && childElement(nv, XDR_NS, 'cNvPr');
    const descr = cNvPr && attributeOf(cNvPr, '', 'descr');
    const { original, ...as } = read;
    // The original LiveDoc kept, while the chart still sums as it was written (D290).
    const chart = chartRestored(
      {
        ...as,
        ...place,
        ...(descr && descr !== read.title ? { alt: descr.slice(0, SHEET_CHART_ALT_MAX) } : {}),
      },
      original,
      'xlsx',
    );
    charts.push({ ...chart, kept: { part: name!, sum: fileChartSum(chart) } });
  }
  return charts.length || slicers.size || pictures.length
    ? { charts, slicers, pictures, media }
    : null;
}

const DRAWING = /^<(?:[\w.-]+:)?drawing\b/;
const REL_ID = /\s[\w.-]+:id="([^"]+)"/;

/**
 * The sheets with the charts and pictures their kept drawings hold, and the kept content without those drawings and
 * the pictures' media no kept part still names (D275, D628); a sheet whose drawing does not qualify keeps it whole.
 */
export function readXlsxCharts(
  sheets: readonly FileSheet[],
  kept: KeptContent<FileAt> | undefined,
  // By sheet, the table slicers its drawing may hold (xlsx-slicers-read.ts); their places come back in `slicers`.
  slicerNames: (sheet: number) => ReadonlySet<string> = () => new Set(),
): {
  sheets: FileSheet[];
  kept: KeptContent<FileAt> | undefined;
  slicers?: Map<string, AnchorPlace>[];
} {
  if (!kept) return { sheets: [...sheets], kept };
  const parts = new Map(kept.parts.map((p) => [p.name, p]));
  let items = kept.items;
  let relationships = kept.relationships;
  const gone = new Set<string>();
  const media = new Set<string>();
  const placed = sheets.map(() => new Map<string, AnchorPlace>());
  const out = sheets.map((sheet, i) => {
    const item = kept.items.find(
      (it) => it.place === 'worksheet' && it.at.sheet === i && DRAWING.test(it.xml),
    );
    const relId = item && REL_ID.exec(item.xml)?.[1];
    const rel = kept.relationships.find(
      (r) => r.from === 'sheet' && r.at.sheet === i && r.id === relId && !r.external,
    );
    const drawing = rel ? parts.get(rel.target.replace(/^\//, '')) : undefined;
    const drawn = drawing ? drawingObjects(drawing, parts, sheet, slicerNames(i)) : null;
    if (!drawn) return sheet;
    const { charts, pictures } = drawn;
    placed[i] = drawn.slicers;
    items = items.filter((it) => it !== item);
    relationships = relationships.filter((r) => r !== rel);
    gone.add(drawing!.name);
    for (const name of drawn.media) media.add(name);
    return {
      ...sheet,
      ...(charts.length ? { charts } : {}),
      ...(pictures.length ? { readPictures: pictures } : {}),
    };
  });
  const left = kept.parts.filter((p) => !gone.has(p.name));
  // A picture's media another kept part still names stays with it.
  const named = new Set(
    left.flatMap((p) =>
      p.rels.filter((r) => !r.external).map((r) => resolvePartName(p.name, r.target)),
    ),
  );
  return {
    sheets: out,
    kept: {
      ...kept,
      items,
      relationships,
      parts: left.filter((p) => !media.has(p.name) || named.has(p.name)),
    },
    ...(placed.some((m) => m.size) ? { slicers: placed } : {}),
  };
}
