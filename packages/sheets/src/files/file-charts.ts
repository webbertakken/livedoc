// A sheet's charts as a file holds them (docs/specs/029-sheets/standard-mapping.md "Charts in the file"): by position,
// each series the cells it reads and the values it showed, read as the grid reads a chart's range (chart-data.ts).
import { emptyChartTable, sheetChartTable } from '../chart-data';
import type { Workbook } from '../engine/workbook';
import { layoutIndex } from '../layout';
import type { SheetChart, SheetChartType } from '../objects/sheet-objects';
import type { Sheet } from '../sheet';

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
};

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
  // A scatter's x is its label column's numbers, else its first column of numbers (charts.md "The model").
  const scatter = chart.type === 'scatter';
  const scatterX = scatter && labels === null && all.length > 1;
  const [first, ...rest] = all;
  const labelX =
    scatter && labels !== null
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
