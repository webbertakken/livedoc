// A spreadsheet's charts for an agent (docs/specs/029-sheets/sheet-store.md "Built for agents in a spreadsheet",
// charts.md "The model"): change_sheet's chart becomes the sheet's own chart, a layout write that sets it whole (a new
// one on top, or in the place of the one `replace` names), clear_charts the writes that take them off (by a range, or
// one by its id), and read_sheet
// the charts as A1. Pure.
import {
  formatA1,
  formatRange,
  layoutIndex,
  makeAxisIds,
  posRangeOf,
  sheetChartTable,
  type GridRange,
  type Rand,
  type SheetChart,
  type SheetChartLegend,
  type SheetChartSeriesLook,
  type SheetChartType,
  type SheetLayout,
  type SheetWrite,
  type Workbook,
} from '@livedoc/sheets';
import { columnLetters } from '@livedoc/sheets';
import type { SheetChartOut } from './sheet-charts';
import type { SheetRefusal } from './sheet-state';

const refuse = (code: string, message: string): SheetRefusal => ({ ok: false, code, message });

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const charts = (layout: SheetLayout): SheetChart[] =>
  (layout.objects ?? []).filter((x): x is SheetChart => x.kind === 'chart');

// The id a new chart of the sheet takes: free among its charts and those made alongside it (a design's several).
export function newChartId(
  layout: SheetLayout,
  rand: Rand,
  taken: ReadonlySet<string> = new Set(),
): string {
  return makeAxisIds(1, rand, new Set([...taken, ...charts(layout).map((x) => x.id)]))[0]!;
}

// The refusal for a chart id the sheet does not hold, naming those it does.
function noChart(layout: SheetLayout, id: string): SheetRefusal {
  return refuse(
    'chart_not_found',
    `No chart "${id}" on this sheet. Its charts: ${
      charts(layout)
        .map((x) => x.id)
        .join(', ') || 'none'
    } (read_sheet lists them).`,
  );
}

// The sheet's chart an agent's `chart` change makes: a new one, or (`replace`) one of the sheet's in its place.
export function chartObjectWrite(
  wb: Workbook,
  sheetId: string,
  out: SheetChartOut,
  replace: string | undefined,
  rand: Rand,
): { ok: true; write: SheetWrite; id: string } | SheetRefusal {
  const { layout } = wb.sheet(sheetId)!;
  if (replace !== undefined && !charts(layout).some((x) => x.id === replace))
    return noChart(layout, replace);
  const id = replace ?? newChartId(layout, rand);
  return { ok: true, id, write: chartObjectSet(wb, sheetId, out, id) };
}

// The layout write that sets the chart `out` describes, under `id`.
export function chartObjectSet(
  wb: Workbook,
  sheetId: string,
  out: SheetChartOut,
  id: string,
): SheetWrite {
  const { layout } = wb.sheet(sheetId)!;
  // The series drawn as lines, kept by their columns' ids so they follow a column moved or renamed.
  const table = out.lines?.length
    ? sheetChartTable(
        wb,
        { sheetId, range: out.range, ...(out.cols ? { cols: out.cols } : {}) },
        wb.locale,
      )
    : null;
  const series: Record<string, SheetChartSeriesLook> = {};
  for (const s of table?.series ?? [])
    if (out.lines!.some((name) => sameName(s.name, name))) series[s.col] = { line: true };
  const look = out.look ?? {};
  const [r, c] = out.cell;
  const object: SheetChart = {
    id,
    kind: 'chart',
    at: {
      r: layout.rows[Math.min(r, layout.rows.length - 1)]!,
      c: layout.cols[Math.min(c, layout.cols.length - 1)]!,
      dx: 0,
      dy: 0,
    },
    width: out.width,
    height: out.height,
    type: out.type,
    range: out.range,
    ...(out.cols ? { cols: out.cols } : {}),
    ...(out.palette ? { palette: out.palette } : {}),
    ...(look.legend ? { legend: look.legend } : {}),
    ...(look.values ? { values: true as const } : {}),
    ...(look.axis === false ? { axis: false as const } : {}),
    ...(look.title ? { title: look.title } : {}),
    ...(look.xAxisTitle ? { xTitle: look.xAxisTitle } : {}),
    ...(look.yAxisTitle ? { yTitle: look.yAxisTitle } : {}),
    ...(look.alt ? { alt: look.alt } : {}),
    ...(Object.keys(series).length ? { series } : {}),
  };
  return { kind: 'layout', changes: [{ k: 'object', id, object }] };
}

// Whether a chart reads any cell of `g`.
function reads(layout: SheetLayout, chart: SheetChart, g: GridRange): boolean {
  const p = chart.range ? posRangeOf(layout, chart.range) : null;
  return !!p && p.r1 <= g.r2 && g.r1 <= p.r2 && p.c1 <= g.c2 && g.c1 <= p.c2;
}

// The write that takes off the sheet's charts reading cells of `range` (every one for null), and how many; null when
// none does.
export function chartsClearWrite(
  layout: SheetLayout,
  range: GridRange | null,
): { write: SheetWrite; count: number } | null {
  const gone = charts(layout).filter((x) => range === null || reads(layout, x, range));
  if (!gone.length) return null;
  return {
    count: gone.length,
    write: {
      kind: 'layout',
      changes: gone.map((x) => ({ k: 'object' as const, id: x.id, object: null })),
    },
  };
}

// The write that takes off the one chart of `id`, the rest kept; refused when the sheet holds none of that id.
export function chartClearWrite(
  layout: SheetLayout,
  id: string,
): { ok: true; write: SheetWrite } | SheetRefusal {
  if (!charts(layout).some((x) => x.id === id)) return noChart(layout, id);
  return { ok: true, write: { kind: 'layout', changes: [{ k: 'object', id, object: null }] } };
}

// A chart as read_sheet answers it: in A1, its lines by their series' names.
export type ChartRead = {
  id: string;
  type: SheetChartType;
  range: string | null;
  columns?: string[];
  at: string;
  width: number;
  height: number;
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  legend: SheetChartLegend;
  values: boolean;
  axis: boolean;
  alt?: string;
  lines?: string[];
};

export function chartsRead(wb: Workbook, sheetId: string): ChartRead[] {
  const { layout } = wb.sheet(sheetId)!;
  const ix = layoutIndex(layout);
  return charts(layout).map((x) => {
    const p = x.range ? posRangeOf(layout, x.range) : null;
    const lineCols = Object.entries(x.series ?? {})
      .filter(([, look]) => look.line)
      .map(([col]) => col);
    const table =
      lineCols.length && x.range
        ? sheetChartTable(
            wb,
            { sheetId, range: x.range, ...(x.cols ? { cols: x.cols } : {}) },
            wb.locale,
          )
        : null;
    const lines = (table?.series ?? []).filter((s) => lineCols.includes(s.col)).map((s) => s.name);
    const columns = x.cols
      ?.map((id) => ix.colPos.get(id))
      .filter((c): c is number => c !== undefined)
      .map(columnLetters);
    return {
      id: x.id,
      type: x.type,
      range: p ? formatRange(p) : null,
      ...(columns?.length ? { columns } : {}),
      // An anchor's cell is always the sheet's: a deletion moves it to the line taking its place.
      at: formatA1(ix.rowPos.get(x.at.r)!, ix.colPos.get(x.at.c)!),
      width: x.width,
      height: x.height,
      ...(x.title ? { title: x.title } : {}),
      ...(x.xTitle ? { xAxisTitle: x.xTitle } : {}),
      ...(x.yTitle ? { yAxisTitle: x.yTitle } : {}),
      legend: x.legend ?? 'bottom',
      values: x.values === true,
      axis: x.axis !== false,
      ...(x.alt ? { alt: x.alt } : {}),
      ...(lines.length ? { lines } : {}),
    };
  });
}
