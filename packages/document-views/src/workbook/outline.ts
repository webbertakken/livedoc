// The workbook outline (docs/specs/024-agents/document-views.md "A spreadsheet's views"): a spreadsheet's header,
// then a line per sheet in tab order, the tab asked for marked, each followed by its parts (named ranges, rule
// counts, alternating colours, charts). It reads no cell: a sheet's used range comes from the ids of the rows and
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
  type SheetObject,
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

function chartJson(layout: SheetLayout, chart: SheetObject): WorkbookOutlineChartJson {
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

function sheetJson(sheet: WorkbookOutlineSheet, current: string): WorkbookOutlineSheetJson {
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
      .filter((x) => x.kind === 'chart')
      .map((x) => chartJson(layout, x)),
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
  return lines;
}

export function workbookOutlineView(
  input: WorkbookOutlineInput,
  opts: { budget?: number; door?: ViewDoor } = {},
): ViewResult<WorkbookOutlineJson> {
  const { workbook } = input;
  const sheets = input.sheets.map((s) => sheetJson(s, input.current));
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
