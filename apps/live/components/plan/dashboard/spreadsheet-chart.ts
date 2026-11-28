// A Sheet Chart from a spreadsheet (docs/specs/029-sheets/plan-links.md "The Sheet Chart from a spreadsheet", D508):
// the charts a linked sheet carries, how the picker names them, the content a new one over a range is, and the chart
// element a slot draws, made by the spreadsheet's own chart code (sheetChartElement over sheetChartTable) from the
// sheet as the page last read it. Pure.
import {
  CHART_TYPE_LABELS,
  type ChartType,
  type DashboardSheetChart,
  type ShapeElement,
} from '@livedoc/document';
import { sheetChartElement } from '@livedoc/plan-art';
import {
  formatRange,
  idRangeOf,
  parseRangeText,
  posRangeOf,
  sheetChartTable,
  type Sheet,
  type SheetChart,
  type Workbook,
} from '@livedoc/sheets';

/** The charts on a linked sheet, in paint order. */
export function linkedSheetCharts(sheet: Sheet): SheetChart[] {
  return (sheet.layout.objects ?? []).filter((o): o is SheetChart => o.kind === 'chart');
}

/** "Column Chart · A1:C6": its type and the range it reads now (just its type once its cells are gone). */
export function linkedChartLabel(chart: SheetChart, sheet: Sheet): string {
  const name = `${CHART_TYPE_LABELS[chart.type]} Chart`;
  const at = chart.range ? posRangeOf(sheet.layout, chart.range) : null;
  return at ? `${name} · ${formatRange(at)}` : name;
}

/** A new chart of `chartType` over the range typed as `text` ("A1:C6") on the spreadsheet's sheet, or null when it
 *  is not a range there. */
export function newLinkedChart(
  documentId: string,
  sheet: Sheet,
  text: string,
  chartType: ChartType,
): DashboardSheetChart | null {
  const g = parseRangeText(text.trim().toUpperCase());
  const { rows, cols } = sheet.layout;
  if (!g || g.r2 >= rows.length || g.c2 >= cols.length) return null;
  const range = idRangeOf(sheet.layout, g.r1, g.c1, g.r2, g.c2);
  return range ? { type: 'sheet-chart', documentId, sheetId: sheet.id, range, chartType } : null;
}

// The chart a new one over a range is: the type and range alone, as a new chart of that type in the spreadsheet.
function chartOf(content: DashboardSheetChart, sheet: Sheet, id: string): SheetChart | null {
  if ('chartId' in content)
    return linkedSheetCharts(sheet).find((c) => c.id === content.chartId) ?? null;
  return {
    id,
    kind: 'chart',
    type: content.chartType,
    at: { r: content.range.r1, c: content.range.c1, dx: 0, dy: 0 },
    width: 0,
    height: 0,
    range: content.range,
  };
}

/** The chart element the slot draws at `size`, its data the sheet's now; null when the chart was deleted. */
export function linkedChartElement(
  content: DashboardSheetChart,
  read: { sheet: Sheet; wb: Workbook; locale: string },
  slotId: string,
  size: { width: number; height: number },
): ShapeElement | null {
  const chart = chartOf(content, read.sheet, `slot-chart-${slotId}`);
  if (!chart) return null;
  const table = chart.range
    ? sheetChartTable(
        read.wb,
        { sheetId: read.sheet.id, range: chart.range, ...(chart.cols ? { cols: chart.cols } : {}) },
        read.locale,
      )
    : null;
  const { sheetAnchor: _anchor, ...el } = sheetChartElement(
    { ...chart, width: size.width, height: size.height },
    read.sheet.id,
    table,
    { x: 0, y: 0 },
  );
  return { ...el, x: 0, y: 0 };
}
