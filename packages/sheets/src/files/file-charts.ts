// A sheet's charts as a file holds them (docs/specs/029-sheets/standard-mapping.md "Charts in the file"): by position,
// each series the cells it reads and the values it showed, read as the grid reads a chart's range (chart-data.ts).
import { emptyChartTable, sheetChartTable } from '../chart-data';
import type { Workbook } from '../engine/workbook';
import { layoutIndex } from '../layout';
import { makeAxisIds, type Rand } from '../ids';
import type {
  SheetChart,
  SheetChartKept,
  SheetChartSeriesLook,
  SheetChartType,
} from '../objects/sheet-objects';
import type { Sheet, SheetLayout } from '../sheet';

// A block of cells by position, zero-based.
export type FileRange = { r1: number; c1: number; r2: number; c2: number };

export type FileChartSeries = {
  name: string;
  // The header cell naming it, when the range has a header row.
  nameAt: { r: number; c: number } | null;
  values: FileRange;
  cached: (number | null)[];
  color?: string;
  line?: true;
};

export type FileChart = {
  id: string;
  type: SheetChartType;
  title?: string;
  xTitle?: string;
  yTitle?: string;
  legend: 'top' | 'right' | 'bottom' | 'left' | 'none';
  values: boolean;
  axis: boolean;
  alt?: string;
  at: { r: number; c: number; dx: number; dy: number };
  width: number;
  height: number;
  // The category labels' cells and text (a label column), or a scatter's x values; null when the read numbers them.
  labels: { range: FileRange; cached: string[] } | null;
  x: { range: FileRange; cached: (number | null)[] } | null;
  series: FileChartSeries[];
  // A chart read from a file: its kept XML and the sum it was read as (D276).
  kept?: SheetChartKept;
};

// FNV-1a, 32 bits, as eight hex digits.
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * What a chart is, by position, as a sum (standard-mapping.md "Charts in the file", D276): its type, titles, legend,
 * values, axis, alt, place, size, and the cells it reads with each series' look; never the values it shows, nor names.
 */
export function fileChartSum(chart: FileChart): string {
  return fnv1a(
    JSON.stringify([
      chart.type,
      chart.title ?? '',
      chart.xTitle ?? '',
      chart.yTitle ?? '',
      chart.legend,
      chart.values,
      chart.axis,
      chart.alt ?? '',
      chart.at,
      chart.width,
      chart.height,
      chart.labels?.range ?? null,
      chart.x?.range ?? null,
      chart.series.map((s) => [s.values, s.nameAt, s.color ?? '', s.line === true]),
    ]),
  );
}

const columnRange = (rows: readonly number[], c: number): FileRange => ({
  r1: rows[0]!,
  c1: c,
  r2: rows.at(-1)!,
  c2: c,
});

function fileChartOf(engine: Workbook, sheet: Sheet, chart: SheetChart, locale: string): FileChart {
  const ix = layoutIndex(sheet.layout);
  const table =
    (chart.range
      ? sheetChartTable(
          engine,
          { sheetId: sheet.id, range: chart.range, ...(chart.cols ? { cols: chart.cols } : {}) },
          locale,
        )
      : null) ?? emptyChartTable();
  const { header, labels, rows, cols } = table.at;
  const all = table.series.map((s, i): FileChartSeries => {
    const look = chart.series?.[s.col];
    return {
      name: s.name,
      nameAt: header === null ? null : { r: header, c: cols[i]! },
      values: columnRange(rows, cols[i]!),
      cached: s.values,
      ...(look?.color ? { color: look.color } : {}),
      ...(look?.line ? { line: true as const } : {}),
    };
  });
  // A scatter's x is its label column's numbers, else its first column of numbers (charts.md "The model"); a label
  // column of text names its points, which the file leaves in the sheet, and its first column of numbers is its x.
  const scatter = chart.type === 'scatter';
  const scatterX = scatter && (labels === null || table.named) && all.length > 1;
  const [first, ...rest] = all;
  const labelX =
    scatter && labels !== null && !table.named
      ? {
          range: columnRange(rows, labels),
          cached: rows.map((r) => {
            const v = engine.value(sheet.id, r, labels);
            return typeof v === 'number' ? v : null;
          }),
        }
      : null;
  return {
    id: chart.id,
    type: chart.type,
    ...(chart.title ? { title: chart.title } : {}),
    ...(chart.xTitle ? { xTitle: chart.xTitle } : {}),
    ...(chart.yTitle ? { yTitle: chart.yTitle } : {}),
    legend: chart.legend ?? 'bottom',
    values: chart.values === true,
    axis: chart.axis !== false,
    ...(chart.alt ? { alt: chart.alt } : {}),
    ...(chart.kept ? { kept: chart.kept } : {}),
    // An anchor's cell is always the sheet's: a deletion moves it to the line taking its place.
    at: {
      r: ix.rowPos.get(chart.at.r)!,
      c: ix.colPos.get(chart.at.c)!,
      dx: chart.at.dx,
      dy: chart.at.dy,
    },
    width: chart.width,
    height: chart.height,
    labels:
      labels === null || scatter
        ? null
        : { range: columnRange(rows, labels), cached: table.categories },
    x: scatterX ? { range: first!.values, cached: first!.cached } : labelX,
    series: scatterX ? rest : all,
  };
}

/** The sheet's charts as its file holds them, in paint order; none when it holds none. */
export function fileChartsOf(engine: Workbook, sheet: Sheet, locale: string): FileChart[] {
  return (sheet.layout.objects ?? [])
    .filter((x): x is SheetChart => x.kind === 'chart')
    .map((chart) => fileChartOf(engine, sheet, chart, locale));
}

// One read chart as the sheet's own (charts.md "The model"): its place and range by the sheet's ids, its series' looks
// by their columns, its kept XML named; null when its place or cells fall past what the sheet holds.
function sheetChartOf(chart: FileChart, layout: SheetLayout, id: string): SheetChart | null {
  const row = (r: number) => layout.rows[r];
  const col = (c: number) => layout.cols[c];
  const at = { r: row(chart.at.r), c: col(chart.at.c) };
  const first = chart.labels?.range ?? chart.x?.range ?? chart.series[0]?.values;
  const last = chart.series.at(-1)?.values;
  if (!at.r || !at.c || !first || !last) return null;
  const header = chart.series[0]!.nameAt?.r;
  const columns = [
    ...(chart.labels ? [chart.labels.range.c1] : chart.x ? [chart.x.range.c1] : []),
    ...chart.series.map((s) => s.values.c1),
  ];
  const ids = columns.map(col);
  const [r1, r2, c1, c2] = [row(header ?? first.r1), row(last.r2), col(first.c1), col(last.c1)];
  if (!r1 || !r2 || !c1 || !c2 || ids.some((x) => x === undefined)) return null;
  const contiguous = columns.every((c, i) => c === columns[0]! + i);
  const series: Record<string, SheetChartSeriesLook> = {};
  for (const s of chart.series)
    if (s.color || s.line)
      series[col(s.values.c1)!] = {
        ...(s.color ? { color: s.color } : {}),
        ...(s.line ? { line: true as const } : {}),
      };
  return {
    id,
    kind: 'chart',
    at: { r: at.r, c: at.c, dx: chart.at.dx, dy: chart.at.dy },
    width: chart.width,
    height: chart.height,
    type: chart.type,
    range: { r1, c1, r2, c2 },
    ...(contiguous ? {} : { cols: ids as string[] }),
    ...(chart.legend !== 'bottom' ? { legend: chart.legend } : {}),
    ...(chart.values ? { values: true as const } : {}),
    ...(chart.axis ? {} : { axis: false as const }),
    ...(chart.title ? { title: chart.title } : {}),
    ...(chart.xTitle ? { xTitle: chart.xTitle } : {}),
    ...(chart.yTitle ? { yTitle: chart.yTitle } : {}),
    ...(chart.alt ? { alt: chart.alt } : {}),
    ...(Object.keys(series).length ? { series } : {}),
    ...(chart.kept ? { kept: chart.kept } : {}),
  };
}

/** A sheet's charts read from its file, as its own, in paint order; those past what it holds are left out. */
export function sheetChartsFromFile(
  charts: readonly FileChart[] | undefined,
  layout: SheetLayout,
  rand: Rand,
): SheetChart[] {
  const out: SheetChart[] = [];
  for (const chart of charts ?? []) {
    const id = makeAxisIds(1, rand, new Set(out.map((x) => x.id)))[0]!;
    const made = sheetChartOf(chart, layout, id);
    if (made) out.push(made);
  }
  return out;
}
