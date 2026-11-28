// The workbook outline (docs/specs/024-agents/document-views.md "A spreadsheet's views"): a spreadsheet's header,
// then a line per sheet in tab order, the tab asked for marked, each followed by its parts (named ranges, rule
// counts, alternating colours, charts, pivot tables). It reads no cell: a sheet's used range comes from the ids of the rows and
// columns holding a cell, which the caller reads without the cells themselves.
import type { ViewDoor } from '@livedoc/api-schema';
import {
  columnLetters,
  formatA1,
  formatRange,
  layoutIndex,
  posRangeOf,
  type IdRange,
  type SheetLayout,
  type SheetChart,
  type SheetImage,
  type SheetPivot,
  type WorkbookRecord,
} from '@livedoc/sheets';
import { fitLines, fitOf, type ViewLine, type ViewResult } from '../budget';
import { attrValue, jsonString, plural } from '../text';

export type WorkbookOutlineSheet = {
  id: string;
  tabId: string;
  title: string;
  layout: SheetLayout;
  cellCount: number;
  // The ids of the rows and of the columns holding a cell.
  usedRows: ReadonlySet<string>;
  usedCols: ReadonlySet<string>;
};

export type WorkbookOutlineInput = {
  name: string;
  workbook: WorkbookRecord;
  // In tab order.
  sheets: readonly WorkbookOutlineSheet[];
  // The tab the view was asked of, marked on its sheet's line.
  current: string;
};

export type WorkbookOutlineChartJson = {
  id: string;
  type: string;
  range: string | null;
  at: string;
  title?: string;
  lines?: string[];
};

export type WorkbookOutlinePivotJson = {
  id: string;
  range: string | null;
  at: string;
  // The fields' source columns by letter, values by their summary: rows=A cols=C values=SUM(D).
  rows: string[];
  columns: string[];
  values: string[];
};

// An image over cells (inserted-objects.md "Images over cells"): its id, cell, size and alt text.
export type WorkbookOutlineImageJson = {
  id: string;
  at: string;
  width: number;
  height: number;
  alt?: string;
};

export type WorkbookOutlineSheetJson = {
  title: string;
  tabId: string;
  current: boolean;
  hidden: boolean;
  used: string | null;
  cells: number;
  frozen: { rows: number; cols: number };
  filter: string | null;
  merges: number;
  names: { name: string; range: string }[];
  rules: { validation: number; format: number };
  bands: number;
  charts: WorkbookOutlineChartJson[];
  pivots: WorkbookOutlinePivotJson[];
  images: WorkbookOutlineImageJson[];
};

export type WorkbookOutlineJson = {
  view: 'outline';
  spreadsheet: { name: string; format: string; locale: string; timeZone: string };
  sheets: WorkbookOutlineSheetJson[];
};

const SHEET_LINE = { one: 'sheet line', many: 'sheet lines' };
const PART_LINE = { one: 'part line', many: 'part lines' };

// The last position of the used ids, or -1 when none is in the layout.
function lastPos(used: ReadonlySet<string>, pos: ReadonlyMap<string, number>): number {
  let last = -1;
  for (const id of used) last = Math.max(last, pos.get(id) ?? -1);
  return last;
}

function usedRange(sheet: WorkbookOutlineSheet): string | null {
  const ix = layoutIndex(sheet.layout);
  const r2 = lastPos(sheet.usedRows, ix.rowPos);
  const c2 = lastPos(sheet.usedCols, ix.colPos);
  return r2 < 0 || c2 < 0 ? null : formatRange({ r1: 0, c1: 0, r2, c2 });
}

function a1Of(layout: SheetLayout, range: IdRange): string | null {
  const pos = posRangeOf(layout, range);
  return pos ? formatRange(pos) : null;
}

function chartJson(layout: SheetLayout, chart: SheetChart): WorkbookOutlineChartJson {
  const ix = layoutIndex(layout);
  const lineCols = new Set(
    Object.entries(chart.series ?? {})
      .filter(([, look]) => look.line)
      .map(([col]) => col),
  );
  const lines = [...lineCols]
    .map((col) => ix.colPos.get(col))
    .filter((c): c is number => c !== undefined)
    .map(columnLetters);
  return {
    id: chart.id,
    type: chart.type,
    range: chart.range ? a1Of(layout, chart.range) : null,
    // An anchor's cell is always the sheet's: a deletion moves it to the line taking its place.
    at: formatA1(ix.rowPos.get(chart.at.r)!, ix.colPos.get(chart.at.c)!),
    ...(chart.title ? { title: chart.title } : {}),
    ...(lines.length ? { lines } : {}),
  };
}

// A pivot table without reading a cell: its source by A1 (another sheet's by its title), its fields by column letter.
function pivotJson(
  layout: SheetLayout,
  pivot: SheetPivot,
  sheets: readonly WorkbookOutlineSheet[],
): WorkbookOutlinePivotJson {
  const ix = layoutIndex(layout);
  const src = pivot.source;
  const home =
    src?.s !== undefined
      ? sheets.find((x) => x.id === src.s)
      : src?.st !== undefined
        ? sheets.find((x) => x.title.toLowerCase() === src.st!.toLowerCase())
        : undefined;
  const elsewhere = src?.s !== undefined || src?.st !== undefined;
  const srcLayout = home?.layout ?? layout;
  const letter = (col: string) => {
    const c = layoutIndex(srcLayout).colPos.get(col);
    return c === undefined ? '?' : columnLetters(c);
  };
  const a1 = src && (home || !elsewhere) ? a1Of(srcLayout, src) : null;
  const r = ix.rowPos.get(pivot.at.r);
  const c = ix.colPos.get(pivot.at.c);
  return {
    id: pivot.id,
    range: a1 && (home ? `${jsonString(home.title)}!${a1}` : a1),
    at: r === undefined || c === undefined ? '#REF!' : formatA1(r, c),
    rows: (pivot.rows ?? []).map((g) => letter(g.col)),
    columns: (pivot.columns ?? []).map((g) => letter(g.col)),
    values: (pivot.values ?? []).map((v) =>
      v.formula === undefined ? `${v.summary}(${letter(v.col)})` : v.name,
    ),
  };
}

function imageJson(layout: SheetLayout, image: SheetImage): WorkbookOutlineImageJson {
  const ix = layoutIndex(layout);
  return {
    id: image.id,
    // An anchor's cell is always the sheet's: a deletion moves it to the line taking its place.
    at: formatA1(ix.rowPos.get(image.at.r)!, ix.colPos.get(image.at.c)!),
    width: image.width,
    height: image.height,
    ...(image.alt ? { alt: image.alt } : {}),
  };
}

function sheetJson(
  sheet: WorkbookOutlineSheet,
  current: string,
  sheets: readonly WorkbookOutlineSheet[],
): WorkbookOutlineSheetJson {
  const { layout } = sheet;
  return {
    title: sheet.title,
    tabId: sheet.tabId,
    current: sheet.tabId === current,
    hidden: layout.hidden === true,
    used: usedRange(sheet),
    cells: sheet.cellCount,
    frozen: { rows: layout.frozenRows ?? 0, cols: layout.frozenCols ?? 0 },
    filter: layout.filter ? a1Of(layout, layout.filter) : null,
    merges: layout.merges?.length ?? 0,
    names: (layout.names ?? []).map((n) => ({ name: n.name, range: a1Of(layout, n) ?? '#REF!' })),
    rules: { validation: layout.rules?.length ?? 0, format: layout.formatRules?.length ?? 0 },
    bands: layout.bands?.length ?? 0,
    charts: (layout.objects ?? [])
      .filter((x): x is SheetChart => x.kind === 'chart')
      .map((x) => chartJson(layout, x)),
    pivots: (layout.objects ?? [])
      .filter((x): x is SheetPivot => x.kind === 'pivot')
      .map((x) => pivotJson(layout, x, sheets)),
    images: (layout.objects ?? [])
      .filter((x): x is SheetImage => x.kind === 'image')
      .map((x) => imageJson(layout, x)),
  };
}

function sheetLine(s: WorkbookOutlineSheetJson): string {
  const parts = [`sheet ${jsonString(s.title)}${s.current ? ' ◂' : ''}`];
  if (s.hidden) parts.push('hidden');
  parts.push(s.used ? `${s.used} · ${plural(s.cells, 'cell', 'cells')}` : 'empty');
  const frozen = [
    s.frozen.rows ? plural(s.frozen.rows, 'row', 'rows') : '',
    s.frozen.cols ? plural(s.frozen.cols, 'column', 'columns') : '',
  ].filter(Boolean);
  if (frozen.length) parts.push(`frozen ${frozen.join(', ')}`);
  if (s.filter) parts.push(`filter ${s.filter}`);
  if (s.merges) parts.push(plural(s.merges, 'merge', 'merges'));
  return parts.join(' · ');
}

function partLines(s: WorkbookOutlineSheetJson): string[] {
  const lines: string[] = [];
  if (s.names.length)
    lines.push(`  names ${s.names.map((n) => `${attrValue(n.name)}=${n.range}`).join(', ')}`);
  const { validation, format } = s.rules;
  if (validation || format) lines.push(`  rules ${validation} validation, ${format} format`);
  if (s.bands) lines.push(`  bands ${s.bands}`);
  for (const chart of s.charts) {
    const bits = [`  chart ${chart.id} ${chart.type} ${chart.range ?? 'no data'} at ${chart.at}`];
    if (chart.title) bits.push(jsonString(chart.title));
    if (chart.lines) bits.push(`lines=${chart.lines.join(',')}`);
    lines.push(bits.join(' '));
  }
  for (const image of s.images) {
    const bits = [`  image ${image.id} at ${image.at} ${image.width}x${image.height}`];
    if (image.alt) bits.push(jsonString(image.alt));
    lines.push(bits.join(' '));
  }
  for (const p of s.pivots) {
    const bits = [`  pivot ${p.id} ${p.range ?? 'no data'} at ${p.at}`];
    if (p.rows.length) bits.push(`rows=${p.rows.join(',')}`);
    if (p.columns.length) bits.push(`cols=${p.columns.join(',')}`);
    if (p.values.length) bits.push(`values=${p.values.join(',')}`);
    lines.push(bits.join(' '));
  }
  return lines;
}

export function workbookOutlineView(
  input: WorkbookOutlineInput,
  opts: { budget?: number; door?: ViewDoor } = {},
): ViewResult<WorkbookOutlineJson> {
  const { workbook } = input;
  const sheets = input.sheets.map((s) => sheetJson(s, input.current, input.sheets));
  const header = [
    `spreadsheet ${jsonString(input.name)}`,
    workbook.format,
    plural(sheets.length, 'sheet', 'sheets'),
    workbook.settings.locale,
    workbook.settings.timeZone,
  ].join(' · ');
  const lines: ViewLine[] = sheets.flatMap((s) => [
    { text: sheetLine(s), noun: SHEET_LINE },
    ...partLines(s).map((text) => ({ text, noun: PART_LINE })),
  ]);
  const fitted = fitLines({ header, lines, budget: opts.budget, door: opts.door ?? 'cli' });
  return {
    text: fitted.text,
    json: {
      view: 'outline',
      spreadsheet: {
        name: input.name,
        format: workbook.format,
        locale: workbook.settings.locale,
        timeZone: workbook.settings.timeZone,
      },
      sheets,
    },
    fit: fitOf(fitted),
  };
}
