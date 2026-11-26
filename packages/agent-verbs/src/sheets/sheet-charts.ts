// Charts an agent puts over a sheet's cells (docs/specs/029-sheets/sheet-store.md "Shaping a sheet", sheet.md "Charts"):
// a design's charts over its tables, and change_sheet's `chart` over an A1 range. Each is an ordinary chart element
// linked to the range by row and column ids (so it grows with rows inserted inside it), anchored in its Sheet at a
// cell, carrying its first read for what draws it before a browser reads it live. Pure: the caller adds the elements.
import { withArticle } from '@livedoc/items';
import {
  CHART_SOURCE_COLS_MAX,
  SHEET_ANCHOR_MAX,
  chartFieldsFromTable,
  chartShapeOf,
  lineFieldsFromTable,
  createShape,
  type ChartPaletteId,
  type ChartType,
  type ComboSeriesType,
  type LineSeries,
  type ShapeElement,
} from '@livedoc/document';
import {
  SHEET_ACCENTS,
  accentChartPalette,
  cellKey,
  colWidth,
  layoutIndex,
  columnLetters,
  templateTints,
  columnIndex,
  formatRange,
  idRangeOf,
  parseA1,
  parseRangeText,
  baseRowHeight,
  rowHeights,
  type RowHeights,
  sheetChartTable,
  SHEET_CHART_ALT_MAX,
  SHEET_CHART_TEXT_MAX,
  type IdRange,
  type SheetChartLegend,
  type SheetChartStack,
  type SheetLayout,
  type Workbook,
} from '@livedoc/sheets';
import type { DesignTableInput } from './sheet-design';
import type { SheetRefusal } from './sheet-state';

// A chart to place: its type, the range it reads (only these columns of it when given), its anchor in the Sheet and
// its size, in a palette.
export type SheetChartOut = {
  type: ChartType;
  range: IdRange;
  cols?: string[];
  anchor: { x: number; y: number };
  width: number;
  height: number;
  palette?: ChartPaletteId;
  // A scatter chart's series drawn as lines, by name (pie-chart.md "Lines set by an agent").
  lines?: string[];
  // A Combo chart's series types, and the series on the right-hand axis, by name (pie-chart.md "Combo").
  seriesTypes?: Record<string, ComboSeriesType>;
  rightAxis?: string[];
  // The cell it sits on (row, column), and its titles and the rest of its look (charts.md "The model").
  cell: [number, number];
  look?: SheetChartLook;
};

// A chart's titles and look as an agent gives them (sheet-store.md "Built for agents in a spreadsheet").
export type SheetChartLook = {
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  legend?: SheetChartLegend;
  values?: boolean;
  axis?: boolean;
  // A column, bar or area chart's Stacking (pie-chart.md "Stacking").
  stack?: SheetChartStack;
  // A line chart's Smooth Line (pie-chart.md "Smooth Line").
  smooth?: boolean;
  alt?: string;
};

const LOOK_KEYS = [
  'title',
  'xAxisTitle',
  'yAxisTitle',
  'legend',
  'values',
  'axis',
  'stack',
  'smooth',
  'alt',
] as const;

// The look a change gives, held to the chart's bounds, or the refusal.
function lookOf(change: SheetChartLook): SheetChartLook | SheetRefusal | undefined {
  const look: SheetChartLook = {};
  for (const key of LOOK_KEYS)
    if (change[key] !== undefined) Object.assign(look, { [key]: change[key] });
  const long = (['title', 'xAxisTitle', 'yAxisTitle'] as const).find(
    (k) => (look[k]?.length ?? 0) > SHEET_CHART_TEXT_MAX,
  );
  if (long)
    return refuse(
      'write_invalid',
      `A chart's ${long} is up to ${SHEET_CHART_TEXT_MAX} characters.`,
    );
  if ((look.alt?.length ?? 0) > SHEET_CHART_ALT_MAX)
    return refuse(
      'write_invalid',
      `A chart's alt text is up to ${SHEET_CHART_ALT_MAX} characters.`,
    );
  return Object.keys(look).length ? look : undefined;
}

// The element fields a look gives a Plan chart (pie-chart.md "Model"); the value axis only when it is said.
export function lookFields(look: SheetChartLook | undefined): Partial<ShapeElement> {
  if (!look) return {};
  const titles = {
    ...(look.xAxisTitle ? { x: look.xAxisTitle } : {}),
    ...(look.yAxisTitle ? { y: look.yAxisTitle } : {}),
  };
  return {
    ...(look.title ? { chartTitle: look.title } : {}),
    ...(titles.x || titles.y ? { chartAxisTitles: titles } : {}),
    ...(look.legend === 'none' ? { chartLegend: false } : {}),
    ...(look.legend && look.legend !== 'none' ? { chartLegendPosition: look.legend } : {}),
    ...(look.values !== undefined ? { chartValues: look.values } : {}),
    ...(look.axis !== undefined ? { chartAxis: look.axis } : {}),
    ...(look.stack ? { chartStack: look.stack } : {}),
    ...(look.smooth !== undefined ? { chartSmooth: look.smooth } : {}),
  };
}

export type SheetChartChange = SheetChartLook & {
  // A chart of the sheet's, by id, this one takes the place of (a spreadsheet's).
  replace?: string;
  op: 'chart';
  type: ChartType;
  range: string;
  columns?: string[];
  at?: string;
  width?: number;
  height?: number;
  palette?: ChartPaletteId;
  lines?: string[];
  seriesTypes?: Record<string, ComboSeriesType>;
  rightAxis?: string[];
};

// The chart types that draw one series, the first (sheet.md "Charts"); the others draw them all (D281).
const ONE_SERIES_TYPES: readonly ChartType[] = ['pie', 'doughnut'];
// The types a series may sit on the right-hand axis of.
const RIGHT_AXIS_TYPES: readonly ChartType[] = ['line', 'area', 'combo'];

// What a chart of a one-series type shows of several value columns, said in its answer.
export function seriesNote(type: ChartType, values: readonly string[]): string {
  if (!ONE_SERIES_TYPES.includes(type) || values.length < 2) return '';
  return ` (${withArticle(type)} chart shows one series, ${values[0]}; column, bar, line and area charts show all ${values.length})`;
}

// The palette in the family of a table's header fill (a design's accent, light or dark canvas), or undefined when the
// header is not an accent's.
export function paletteOfHeader(fill: string | undefined): ChartPaletteId | undefined {
  if (!fill) return undefined;
  const accent = SHEET_ACCENTS.find(
    (a) => templateTints(a, false).head === fill || templateTints(a, true).head === fill,
  );
  return accent ? accentChartPalette(accent) : undefined;
}

// The palette a chart takes when none is given: its table's family for a chart of one series, but none (the vivid
// default, whose colours tell apart) for lines, areas and points of several series, which one family's near shades
// would not.
function defaultPalette(
  type: ChartType,
  series: number,
  family: ChartPaletteId | undefined,
): ChartPaletteId | undefined {
  return !ONE_SERIES_TYPES.includes(type) && series > 1 ? undefined : family;
}

// The header names of a range's value columns: its columns past the first (only those picked, when some are).
function valueNames(wb: Workbook, sheetId: string, r: number, cols: readonly number[]): string[] {
  return cols.slice(1).map((c) => {
    const v = wb.value(sheetId, r, c);
    return typeof v === 'string' && v ? v : columnLetters(c);
  });
}

// A chart's size when none is given, the least it takes (the editor's resize floor) and the most.
export const SHEET_CHART_SIZE = { width: 420, height: 280 } as const;
const CHART_MIN = { width: 160, height: 120 } as const;
const CHART_MAX_PX = 2000;
// The chart's canvas place, for what does not draw the grid: in from the Sheet's right edge and below its chrome, as
// the editor and the templates place one.
const CANVAS_INSET_PX = 24;
const CANVAS_TOP_PX = 120;

const refuse = (code: string, message: string): SheetRefusal => ({ ok: false, code, message });

// A cell's top-left, in px from A1's corner: where a chart sits in its Sheet (hidden rows and columns take no room).
// `heightOf` says how tall each row is drawn (rowHeights: a row fits its text); without it, a layout's own sizes.
export function anchorAt(
  layout: SheetLayout,
  at: readonly [number, number],
  heightOf: RowHeights = (id) => baseRowHeight(layout, id),
): { x: number; y: number } {
  // Hidden by hand or collapsed in a group.
  const { hiddenCols, hiddenRows } = layoutIndex(layout);
  let x = 0;
  for (const id of layout.cols.slice(0, at[1])) if (!hiddenCols.has(id)) x += colWidth(layout, id);
  let y = 0;
  for (const id of layout.rows.slice(0, at[0])) if (!hiddenRows.has(id)) y += heightOf(id);
  return { x: Math.min(SHEET_ANCHOR_MAX, x), y: Math.min(SHEET_ANCHOR_MAX, y) };
}

const sized = (v: number | undefined, fallback: number, min: number) =>
  Math.round(Math.min(CHART_MAX_PX, Math.max(min, v ?? fallback)));

const named = (head: readonly string[], name: string) =>
  head.findIndex((h) => h.trim().toLowerCase() === name.trim().toLowerCase());

// Each table's chart: reading the table's header and body (never its total), at its cell (right of the table, a
// column clear, level with its header, by default).
export function designCharts(
  wb: Workbook,
  sheetId: string,
  tables: readonly (DesignTableInput & { at0: [number, number] })[],
  palette: ChartPaletteId,
  font?: string,
): SheetChartOut[] | SheetRefusal {
  const { layout } = wb.sheet(sheetId)!;
  const heightOf = rowHeights(wb, sheetId, font);
  const { rows, cols } = layout;
  const out: SheetChartOut[] = [];
  for (const t of tables) {
    if (!t.chart) continue;
    const [r0, c0] = t.at0;
    let at: [number, number] = [r0, c0 + t.head.length + 1];
    if (t.chart.at !== undefined) {
      const p = parseA1(t.chart.at);
      if (!p)
        return refuse(
          'range_invalid',
          `A chart's at "${t.chart.at}" is not a cell in A1 form ("H4").`,
        );
      at = [p.r, p.c];
    }
    const picked = (t.chart.columns ?? []).map((name) => cols[c0 + named(t.head, name)]!);
    out.push({
      type: t.chart.type,
      range: {
        r1: rows[r0]!,
        c1: cols[c0]!,
        r2: rows[r0 + t.rows.length]!,
        c2: cols[c0 + t.head.length - 1]!,
      },
      ...(picked.length ? { cols: picked.slice(0, CHART_SOURCE_COLS_MAX) } : {}),
      anchor: anchorAt(layout, at, heightOf),
      cell: at,
      width: sized(t.chart.width, SHEET_CHART_SIZE.width, CHART_MIN.width),
      height: sized(t.chart.height, SHEET_CHART_SIZE.height, CHART_MIN.height),
      palette:
        t.chart.palette ??
        defaultPalette(t.chart.type, (t.chart.columns?.length || t.head.length) - 1, palette),
    });
  }
  return out;
}

// change_sheet's `chart`: a range in A1 (its first row the series' names, its first column the labels), only some
// columns of it by letter, at a cell (right of the range, a column clear, level with its top, by default).
export function buildChartChange(
  wb: Workbook,
  sheetId: string,
  change: SheetChartChange,
  font?: string,
): { ok: true; writes: []; line: string; charts: SheetChartOut[] } | SheetRefusal {
  const { layout } = wb.sheet(sheetId)!;
  const heightOf = rowHeights(wb, sheetId, font);
  const g = parseRangeText(change.range);
  const ids = g ? idRangeOf(layout, g.r1, g.c1, g.r2, g.c2) : null;
  if (!g || !ids || g.r2 >= layout.rows.length || g.c2 >= layout.cols.length)
    return refuse(
      'range_invalid',
      `"${change.range}" is not a range of the sheet in A1 form ("A4:C12").`,
    );
  if (g.r1 === g.r2)
    return refuse('range_invalid', 'A chart reads a header row and at least one row of data.');
  const picked: string[] = [];
  for (const letter of change.columns ?? []) {
    const c = columnIndex(letter.trim());
    if (c < g.c1 || c > g.c2)
      return refuse('range_invalid', `Column "${letter}" is not a column of ${formatRange(g)}.`);
    picked.push(layout.cols[c]!);
  }
  let at: [number, number] = [g.r1, g.c2 + 2];
  if (change.at !== undefined) {
    const p = parseA1(change.at);
    if (!p) return refuse('range_invalid', `"${change.at}" is not a cell in A1 form ("H4").`);
    at = [p.r, p.c];
  }
  const lines = linesOf(wb, sheetId, change, { range: ids, cols: picked });
  if (!Array.isArray(lines)) return lines;
  const typed = seriesLooksOf(wb, sheetId, change, { range: ids, cols: picked });
  if ('ok' in typed) return typed;
  const look = lookOf(change);
  if (look && 'ok' in look) return look;
  const sheet = wb.sheet(sheetId)!;
  const cols = change.columns?.length
    ? change.columns.map((l) => columnIndex(l.trim()))
    : Array.from({ length: g.c2 - g.c1 + 1 }, (_, i) => g.c1 + i);
  const values = valueNames(wb, sheetId, g.r1, cols);
  const palette =
    change.palette ??
    defaultPalette(
      change.type,
      values.length,
      paletteOfHeader(sheet.cells.get(cellKey(layout.rows[g.r1]!, layout.cols[g.c1]!))?.format?.bg),
    );
  return {
    ok: true,
    writes: [],
    line: `charted ${formatRange(g)} as ${withArticle(change.type)} chart at ${change.at ?? `the cell right of it`}${seriesNote(change.type, values)}`,
    charts: [
      {
        type: change.type,
        range: ids,
        ...(picked.length ? { cols: picked.slice(0, CHART_SOURCE_COLS_MAX) } : {}),
        anchor: anchorAt(layout, at, heightOf),
        width: sized(change.width, SHEET_CHART_SIZE.width, CHART_MIN.width),
        height: sized(change.height, SHEET_CHART_SIZE.height, CHART_MIN.height),
        ...(palette ? { palette } : {}),
        ...(lines.length ? { lines } : {}),
        ...typed,
        cell: at,
        ...(look ? { look } : {}),
      },
    ],
  };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The series `lines` names, checked against those the chart reads (a scatter's numbered first column is its x, no
// series), or the refusal.
function linesOf(
  wb: Workbook,
  sheetId: string,
  change: SheetChartChange,
  read: { range: IdRange; cols: readonly string[] },
): string[] | SheetRefusal {
  if (!change.lines?.length) return [];
  if (change.type !== 'scatter')
    return refuse(
      'write_invalid',
      `lines draw on a scatter chart; ${withArticle(change.type)} chart draws ${change.type === 'line' || change.type === 'area' ? 'every series as a line already' : 'no lines'}.`,
    );
  const unknown = unknownSeries(wb, sheetId, change, read, change.lines);
  return unknown ?? change.lines;
}

// The refusal for the first of `named` that is no series the chart reads (a scatter's numbered first column is its x,
// no series), or null.
function unknownSeries(
  wb: Workbook,
  sheetId: string,
  change: SheetChartChange,
  read: { range: IdRange; cols: readonly string[] },
  named: readonly string[],
): SheetRefusal | null {
  // The range was just checked against this workbook, so it reads.
  const table = sheetChartTable(
    wb,
    { sheetId, range: read.range, ...(read.cols.length ? { cols: [...read.cols] } : {}) },
    wb.locale,
  )!;
  const names =
    change.type === 'scatter'
      ? lineFieldsFromTable({ shape: 'line-chart', chartVariant: 'scatter' }, table).lineSeries.map(
          (s) => s.name,
        )
      : table.series.map((s) => s.name);
  const unknown = named.find((l) => !names.some((n) => sameName(n, l)));
  return unknown === undefined
    ? null
    : refuse(
        'write_invalid',
        `"${unknown}" is no series of the chart. Its series: ${names.join(', ')}.`,
      );
}

// A Combo chart's series types and the series on the right-hand axis (pie-chart.md "Combo"), checked against the chart's
// type and series, or the refusal.
function seriesLooksOf(
  wb: Workbook,
  sheetId: string,
  change: SheetChartChange,
  read: { range: IdRange; cols: readonly string[] },
): Pick<SheetChartOut, 'seriesTypes' | 'rightAxis'> | SheetRefusal {
  const types = Object.keys(change.seriesTypes ?? {});
  const right = change.rightAxis ?? [];
  if (types.length && change.type !== 'combo')
    return refuse(
      'write_invalid',
      `seriesTypes type a combo chart's series; ${withArticle(change.type)} chart draws each as its own type.`,
    );
  if (right.length && !RIGHT_AXIS_TYPES.includes(change.type))
    return refuse(
      'write_invalid',
      `rightAxis puts a line, area or combo chart's series on a second axis; ${withArticle(change.type)} chart has one.`,
    );
  const unknown = unknownSeries(wb, sheetId, change, read, [...types, ...right]);
  if (unknown) return unknown;
  return {
    ...(types.length ? { seriesTypes: change.seriesTypes! } : {}),
    ...(right.length ? { rightAxis: right } : {}),
  };
}

// A series' type and axis an agent gave, by its name.
export function namedLook(
  out: Pick<SheetChartOut, 'seriesTypes' | 'rightAxis'>,
  name: string,
): { type?: ComboSeriesType; right?: true } {
  const type = Object.entries(out.seriesTypes ?? {}).find(([n]) => sameName(n, name))?.[1];
  const right = out.rightAxis?.some((n) => sameName(n, name));
  return { ...(type ? { type } : {}), ...(right ? { right: true as const } : {}) };
}

// The chart elements, linked to their Sheet's sheet and anchored in it, each with its first read from `wb`, their
// canvas place over the Sheet `sheetEl`'s top right.
export function sheetChartElements(
  wb: Workbook,
  sheetEl: { x: number; y: number; width: number; height: number },
  sheetId: string,
  charts: readonly SheetChartOut[],
): ShapeElement[] {
  return charts.map((ch) => {
    const { shape, chartVariant } = chartShapeOf(ch.type);
    const source = { sheetId, range: ch.range, ...(ch.cols ? { cols: ch.cols } : {}) };
    const base: ShapeElement = {
      ...createShape(shape, 0, 0),
      ...(chartVariant ? { chartVariant } : {}),
      width: ch.width,
      height: ch.height,
      chartSource: source,
      sheetAnchor: ch.anchor,
      ...(ch.palette ? { chartPalette: ch.palette } : {}),
      ...lookFields(ch.look),
    };
    // Its range was just read from this workbook, so it reads.
    const table = sheetChartTable(wb, source, wb.locale)!;
    const fields = chartFieldsFromTable(base, table);
    const lines = ch.lines ?? [];
    return {
      ...base,
      ...fields,
      // The series drawn as lines, a Combo's types and the right-hand axis, marked by name (pie-chart.md "Lines set by
      // an agent", "Combo").
      ...('lineSeries' in fields && fields.lineSeries
        ? {
            lineSeries: fields.lineSeries.map((s): LineSeries => {
              const look = namedLook(ch, s.name);
              return {
                ...s,
                ...(lines.some((l) => sameName(l, s.name)) ? { line: true as const } : {}),
                ...(look.type ? { type: look.type } : {}),
                ...(look.right ? { axis: 'right' as const } : {}),
              };
            }),
          }
        : {}),
      x: Math.max(sheetEl.x, sheetEl.x + sheetEl.width - CANVAS_INSET_PX - ch.width),
      y: sheetEl.y + Math.min(CANVAS_TOP_PX, Math.max(0, sheetEl.height - ch.height)),
    };
  });
}
