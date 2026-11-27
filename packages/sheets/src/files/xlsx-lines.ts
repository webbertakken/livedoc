// Rows and columns in XLSX (docs/specs/029-sheets/standard-mapping.md "Rows and columns in the file"): a row's `ht`,
// `customHeight`, `hidden`, `outlineLevel` and `collapsed`, the same on `cols/col` runs, `sheetFormatPr`'s defaults and
// deepest levels, and `sheetPr/outlinePr`'s side for the controls. A group is collapsed when all its lines are hidden
// and its control's line says so (D168); Excel's own default puts the controls after.
import {
  attributeOf,
  childElement,
  childElements,
  type XmlElement,
} from '@livedoc/office-packages';
import { OUTLINE_DEPTH_MAX } from '../limits';
import { controlLine, groupsOf } from '../outline';
import { SheetLimits } from '../sheet-limits';
import { FILE_LAST_COL } from './a1-text';
import {
  collapsedLines,
  fileGroups,
  type FileAxisLines,
  type FileGroupMark,
  type FileLine,
  type FileLines,
} from './file-lines';
import { excelWidthFromPx, pointsFromPx, pxFromExcelWidth, pxFromPoints } from './line-units';

const { rows: ROWS_MAX, cols: COLS_MAX } = SheetLimits.spreadsheet;
// Excel's own default row: 15 points.
const EXCEL_ROW_POINTS = 15;
// Past every line a file can hold: a group's control after the last line still has a line to sit on.
const NO_END = Number.MAX_SAFE_INTEGER;

const truthy = (v: string | undefined) => v === '1' || v === 'true';
const falsy = (v: string | undefined) => v === '0' || v === 'false';

const elementsOf = (element: XmlElement | undefined, ns: string, local: string): XmlElement[] =>
  element ? childElements(element).filter((e) => e.uri === ns && e.local === local) : [];

const number = (element: XmlElement, name: string): number | undefined => {
  const n = Number(attributeOf(element, '', name));
  return attributeOf(element, '', name) !== undefined && Number.isFinite(n) && n >= 0
    ? n
    : undefined;
};

// A line's hidden, depth and the control flag, and its size when `size` gives one.
type Read = { lines: Map<number, FileLine>; controls: Set<number> };

function readLine(element: XmlElement, p: number, size: number | undefined, read: Read) {
  const line: FileLine = {};
  if (size !== undefined) line.size = size;
  if (truthy(attributeOf(element, '', 'hidden'))) line.hidden = true;
  const level = Math.min(OUTLINE_DEPTH_MAX, Math.trunc(number(element, 'outlineLevel') ?? 0));
  if (level > 0) line.depth = level;
  if (truthy(attributeOf(element, '', 'collapsed'))) read.controls.add(p);
  if (line.size !== undefined || line.hidden || line.depth) read.lines.set(p, line);
}

// The collapsed groups: every line hidden, and their control's line marked collapsed (or none to mark).
function collapsedOf(read: Read, after: boolean): FileGroupMark[] {
  const depths = new Map<number, number>();
  for (const [p, line] of read.lines) if (line.depth) depths.set(p, line.depth);
  return groupsOf(depths).flatMap((g) => {
    for (let p = g.from; p <= g.to; p++) if (!read.lines.get(p)?.hidden) return [];
    // With no end to the lines, every group has a line for its control.
    const control = controlLine({ ...g, collapsed: false }, after, NO_END)!;
    return read.controls.has(control) ? [{ at: g.from, depth: g.depth }] : [];
  });
}

function axisLines(
  read: Read,
  after: boolean,
  size: number | undefined,
): FileAxisLines | undefined {
  if (read.lines.size === 0 && size === undefined) return undefined;
  return {
    lines: read.lines,
    collapsed: collapsedOf(read, after),
    ...(after ? { after: true as const } : {}),
    ...(size === undefined ? {} : { size }),
  };
}

/** A worksheet's rows and columns, its defaults and its controls' side; none when it says nothing of them. */
export function readXlsxLines(root: XmlElement, ns: string): FileLines | undefined {
  const format = childElement(root, ns, 'sheetFormatPr');
  const rowPoints = format && number(format, 'defaultRowHeight');
  const colWidth = format && number(format, 'defaultColWidth');
  const sheetPr = childElement(root, ns, 'sheetPr');
  const outline = sheetPr && childElement(sheetPr, ns, 'outlinePr');
  const below = !falsy(outline && attributeOf(outline, '', 'summaryBelow'));
  const right = !falsy(outline && attributeOf(outline, '', 'summaryRight'));
  const rows: Read = { lines: new Map(), controls: new Set() };
  let next = 0;
  for (const row of elementsOf(childElement(root, ns, 'sheetData'), ns, 'row')) {
    const r = Math.trunc(number(row, 'r') ?? next + 1) - 1;
    next = r + 1;
    if (r < 0 || r >= ROWS_MAX) continue;
    const ht = number(row, 'ht');
    const sized = ht !== undefined && truthy(attributeOf(row, '', 'customHeight'));
    readLine(row, r, sized ? pxFromPoints(ht) : undefined, rows);
  }
  const cols: Read = { lines: new Map(), controls: new Set() };
  for (const col of elementsOf(childElement(root, ns, 'cols'), ns, 'col')) {
    const min = Math.trunc(number(col, 'min') ?? 0);
    const max = Math.min(Math.trunc(number(col, 'max') ?? min), COLS_MAX);
    const width = number(col, 'width');
    for (let c = Math.max(1, min); c <= max; c++)
      readLine(col, c - 1, width === undefined ? undefined : pxFromExcelWidth(width), cols);
  }
  const r = axisLines(rows, below, rowPoints === undefined ? undefined : pxFromPoints(rowPoints));
  const c = axisLines(cols, right, colWidth === undefined ? undefined : pxFromExcelWidth(colWidth));
  if (!r && !c) return undefined;
  return { ...(r ? { r } : {}), ...(c ? { c } : {}) };
}

/** What a worksheet writes of its lines: each row's attributes, its `cols`, `sheetFormatPr` and `outlinePr`. */
export type XlsxLinesOut = {
  // The rows with attributes of their own, by position.
  rows: ReadonlyMap<number, string>;
  cols: string | null;
  sheetFormatPr: string;
  // `outlinePr`'s attributes, for a sheet with groups.
  outlinePr: string | null;
};

// Each line's attributes on one axis, by position, in the schema's order of `row` and `col` attributes.
function lineAttributes(
  axis: FileAxisLines,
  count: number,
  sized: (px: number) => string,
): Map<number, string> {
  const groups = fileGroups(axis);
  const folded = collapsedLines(groups);
  const controls = new Set(
    groups.flatMap((g) => {
      const at = g.collapsed ? controlLine(g, axis.after === true, count) : null;
      return at === null ? [] : [at];
    }),
  );
  const positions = new Set([...axis.lines.keys(), ...folded, ...controls]);
  const out = new Map<number, string>();
  for (const p of [...positions].sort((a, b) => a - b)) {
    if (p >= count) continue;
    const line = axis.lines.get(p);
    const attrs = [
      sized(line?.size ?? -1),
      line?.hidden || line?.filtered || folded.has(p) ? ' hidden="1"' : '',
      line?.depth ? ` outlineLevel="${line.depth}"` : '',
      controls.has(p) ? ' collapsed="1"' : '',
    ].join('');
    out.set(p, attrs);
  }
  return out;
}

const deepest = (axis: FileAxisLines | undefined) =>
  [...(axis?.lines.values() ?? [])].reduce((n, line) => Math.max(n, line.depth ?? 0), 0);

/** A sheet's lines as its worksheet writes them, `rows` by `cols` lines. */
export function xlsxLinesOut(lines: FileLines, rows: number, cols: number): XlsxLinesOut {
  const empty: FileAxisLines = { lines: new Map(), collapsed: [] };
  const rowAxis = lines.r ?? empty;
  const colAxis = lines.c ?? empty;
  const rowAttrs = lineAttributes(rowAxis, rows, (px) =>
    px < 0 ? '' : ` ht="${pointsFromPx(px)}" customHeight="1"`,
  );
  const colDefault = excelWidthFromPx(colAxis.size ?? pxFromExcelWidth(9.140625));
  const colAttrs = lineAttributes(colAxis, Math.min(cols, FILE_LAST_COL), (px) =>
    px < 0 ? ` width="${colDefault}"` : ` width="${excelWidthFromPx(px)}" customWidth="1"`,
  );
  // Runs of columns with the same attributes, one `col` each.
  const runs: string[] = [];
  let run: { from: number; to: number; attrs: string } | null = null;
  for (const [c, attrs] of colAttrs) {
    if (run && run.to === c - 1 && run.attrs === attrs) run.to = c;
    else {
      if (run) runs.push(`<col min="${run.from + 1}" max="${run.to + 1}"${run.attrs}/>`);
      run = { from: c, to: c, attrs };
    }
  }
  if (run) runs.push(`<col min="${run.from + 1}" max="${run.to + 1}"${run.attrs}/>`);
  const rowLevel = deepest(lines.r);
  const colLevel = deepest(lines.c);
  const format = [
    `<sheetFormatPr defaultRowHeight="${lines.r?.size === undefined ? EXCEL_ROW_POINTS : pointsFromPx(lines.r.size)}"`,
    lines.r?.size === undefined ? '' : ' customHeight="1"',
    colAxis.size === undefined ? '' : ` defaultColWidth="${colDefault}"`,
    rowLevel ? ` outlineLevelRow="${rowLevel}"` : '',
    colLevel ? ` outlineLevelCol="${colLevel}"` : '',
    '/>',
  ].join('');
  const outlinePr =
    rowLevel || colLevel
      ? ` summaryBelow="${rowAxis.after ? 1 : 0}" summaryRight="${colAxis.after ? 1 : 0}"`
      : null;
  return {
    rows: rowAttrs,
    cols: runs.length ? `<cols>${runs.join('')}</cols>` : null,
    sheetFormatPr: format,
    outlinePr,
  };
}

// The end of a start tag: the first `>` outside an attribute's quotes.
function startTagEnd(xml: string): number {
  let quote = '';
  for (let i = 0; i < xml.length; i++) {
    const ch = xml[i]!;
    if (quote) quote = ch === quote ? '' : quote;
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i;
  }
  return xml.length;
}

/**
 * A kept `sheetPr` with LiveDoc's own children (its `tabColor` and `outlinePr`) first, as the schema orders them
 * (the kept one holds neither), in the kept element's own prefix (standard-mapping.md "Unknown content").
 */
export function withSheetPrOwn(sheetPr: string, own: (prefix: string) => string): string {
  const prefix = /^<([\w.-]+:)?/.exec(sheetPr)?.[1] ?? '';
  const children = own(prefix);
  const end = startTagEnd(sheetPr);
  // An empty `sheetPr` closes itself: opened for its children.
  if (sheetPr[end - 1] === '/')
    return `${sheetPr.slice(0, end - 1).trimEnd()}>${children}</${prefix}sheetPr>`;
  return sheetPr.slice(0, end + 1) + children + sheetPr.slice(end + 1);
}
