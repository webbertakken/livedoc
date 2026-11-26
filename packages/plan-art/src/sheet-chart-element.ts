// A spreadsheet's chart as the chart element LiveDoc's chart code draws (docs/specs/029-sheets/charts.md "The model"):
// the sheet's object turned into a pie, bar or line chart element, its data the table its range holds now, each
// series' look taken from its column. The grid draws it over the cells, and previews and exports draw it the same,
// so a spreadsheet's chart and a Plan chart share every mark. Pure.
import {
  chartFieldsFromTable,
  chartShapeOf,
  createShape,
  type ChartPaletteId,
  type LineSeries,
  type SheetAnchor,
  type ShapeElement,
} from '@livedoc/document';
import type { SheetChart, SheetChartTable } from '@livedoc/sheets';

// The chart drawn from `table` (null: no data, its marks empty) at `anchor`, px from A1's corner.
export function sheetChartElement(
  chart: SheetChart,
  sheetId: string,
  table: SheetChartTable | null,
  anchor: SheetAnchor,
): ShapeElement {
  const { shape, chartVariant } = chartShapeOf(chart.type);
  const legend = chart.legend ?? 'bottom';
  const titles = {
    ...(chart.xTitle ? { x: chart.xTitle } : {}),
    ...(chart.yTitle ? { y: chart.yTitle } : {}),
  };
  const base: ShapeElement = {
    ...createShape(shape, 0, 0),
    id: chart.id,
    width: chart.width,
    height: chart.height,
    ...(chartVariant ? { chartVariant } : {}),
    ...(chart.palette ? { chartPalette: chart.palette as ChartPaletteId } : {}),
    chartLegend: legend !== 'none',
    ...(legend !== 'none' ? { chartLegendPosition: legend } : {}),
    ...(chart.values ? { chartValues: true } : {}),
    chartAxis: chart.axis !== false,
    ...(chart.title ? { chartTitle: chart.title } : {}),
    ...(titles.x || titles.y ? { chartAxisTitles: titles } : {}),
    ...(chart.range
      ? {
          chartSource: { sheetId, range: chart.range, ...(chart.cols ? { cols: chart.cols } : {}) },
        }
      : {}),
    sheetAnchor: anchor,
  };
  if (!table || !chart.range)
    return shape === 'line-chart'
      ? { ...base, lineCategories: [], lineSeries: [] }
      : { ...base, pieSlices: [] };
  const fields = chartFieldsFromTable(base, table);
  if (!('lineSeries' in fields)) {
    // A pie, column or bar chart draws its first series; a column or bar chart's every bar takes its colour, when its
    // column has one (a pie's slices keep the palette's, one each).
    const color =
      shape === 'bar-chart' && table.series[0]
        ? chart.series?.[table.series[0].col]?.color
        : undefined;
    return {
      ...base,
      pieSlices: color ? fields.pieSlices.map((s) => ({ ...s, color })) : fields.pieSlices,
    };
  }
  // A scatter chart may take its first column of numbers as the x (and its column of text as its point names): the
  // series drawn are the table's last ones.
  const skipped = table.series.length - fields.lineSeries.length;
  const lineSeries = fields.lineSeries.map((s, i): LineSeries => {
    const look = chart.series?.[table.series[i + skipped]!.col];
    return {
      ...s,
      ...(look?.color ? { color: look.color } : {}),
      ...(look?.right ? { axis: 'right' as const } : {}),
      ...(look?.line ? { line: true as const } : {}),
    };
  });
  return {
    ...base,
    lineCategories: fields.lineCategories,
    lineSeries,
    ...(fields.linePointNames ? { linePointNames: fields.linePointNames } : {}),
  };
}
