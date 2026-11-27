// A spreadsheet's sheet as an image (docs/specs/029-sheets/sheet-store.md "Agents in a spreadsheet", Previews): the
// sheet laid out as a Plan Sheet tab is for its image, so it draws through the same renderer and the same PNG step: a
// Sheet framing its cells from A1, or from a range's top-left, and the sheet's own charts over them at their cells. A
// spreadsheet's tab holds no elements of its own, so without this its picture was empty. Pure.
import {
  SHEET_COL_HEAD_H,
  SHEET_HEADER_H,
  SHEET_ROW_HEAD_W,
  createShape,
  planPalette,
  type Element,
  type ShapeElement,
  type SheetRenderModel,
  type Tab,
} from '@livedoc/document';
import {
  colWidth,
  layoutIndex,
  renderWindow,
  rowHeights,
  sheetChartTable,
  sheetContentSize,
  type GridRange,
  type SheetChart,
  type Workbook,
} from '@livedoc/sheets';
import { sheetChartElement } from './sheet-chart-element';

// The most an image is on either side, in px, as a Plan Sheet tab's (plan-export-tab.ts).
export const SHEET_PREVIEW_MAX = 4000;
// What a sheet with nothing in it shows: a few columns and rows, so the image reads as a sheet.
const EMPTY_WINDOW = { width: 400, height: 200 };
// The room kept round a chart at the window's edge.
const EDGE = 24;

// The card a chart sits on, as the spreadsheet draws it over its cells (SheetChartsLayer's card): the light paper's
// surface and border. A chart draws only its marks, so without it the grid's lines showed through.
function chartCard(chart: SheetChart, x: number, y: number): ShapeElement {
  const paper = planPalette('light');
  return {
    ...createShape('square', x, y),
    id: `card-${chart.id}`,
    width: chart.width,
    height: chart.height,
    fillColor: paper.surface,
    strokeColor: paper.border,
    strokeWidth: 'thin',
  };
}

export type SpreadsheetSheetImage = {
  // The sheet laid out as a Plan Sheet tab: its Sheet, then its charts.
  tab: Tab;
  // The Sheet's cells, by sheet id, as renderElementsToSvg takes them (`sheets`).
  sheets: ReadonlyMap<string, SheetRenderModel>;
};

// px along an axis from the position `from` up to `to` (exclusive), hidden lines taking none.
function spanPx(
  ids: readonly string[],
  hidden: ReadonlySet<string>,
  size: (id: string) => number,
  from: number,
  to: number,
): number {
  let px = 0;
  for (let i = from; i < to; i++) if (!hidden.has(ids[i]!)) px += size(ids[i]!);
  return px;
}

export function spreadsheetSheetImage(
  wb: Workbook,
  sheetId: string,
  tab: { id: string; name: string },
  opts: { range?: GridRange; font?: string } = {},
): SpreadsheetSheetImage | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const { layout } = sheet;
  const ix = layoutIndex(layout);
  const heightOf = rowHeights(wb, sheetId, opts.font);
  const widthOf = (id: string) => colWidth(layout, id);
  const range = opts.range;
  const origin = { r: range?.r1 ?? 0, c: range?.c1 ?? 0 };
  // A chart's px from the window's top-left: its cell's corner and its offsets.
  const placed = (chart: SheetChart) => {
    const r = ix.rowPos.get(chart.at.r);
    const c = ix.colPos.get(chart.at.c);
    if (r === undefined || c === undefined || r < origin.r || c < origin.c) return null;
    return {
      x: spanPx(layout.cols, ix.hiddenCols, widthOf, origin.c, c) + chart.at.dx,
      y: spanPx(layout.rows, ix.hiddenRows, heightOf, origin.r, r) + chart.at.dy,
    };
  };
  const charts = (layout.objects ?? []).filter((x): x is SheetChart => x.kind === 'chart');
  let window: { width: number; height: number };
  if (range) {
    window = {
      width: spanPx(layout.cols, ix.hiddenCols, widthOf, range.c1, range.c2 + 1),
      height: spanPx(layout.rows, ix.hiddenRows, heightOf, range.r1, range.r2 + 1),
    };
  } else {
    // The whole sheet: its filled cells and every chart it holds, as its tab shows them.
    window = { ...(sheetContentSize(wb, sheetId, opts.font) ?? EMPTY_WINDOW) };
    for (const chart of charts) {
      const at = placed(chart);
      if (!at) continue;
      window.width = Math.max(window.width, at.x + chart.width + EDGE);
      window.height = Math.max(window.height, at.y + chart.height + EDGE);
    }
  }
  window = {
    width: Math.max(1, Math.min(window.width, SHEET_PREVIEW_MAX - SHEET_ROW_HEAD_W)),
    height: Math.max(
      1,
      Math.min(window.height, SHEET_PREVIEW_MAX - SHEET_HEADER_H - SHEET_COL_HEAD_H),
    ),
  };
  const model = renderWindow(wb, sheetId, window, wb.locale, opts.font, origin)!;
  const frame = {
    ...createShape('plan-sheet', 0, 0),
    id: `preview-${sheetId}`,
    width: window.width + SHEET_ROW_HEAD_W,
    height: window.height + SHEET_HEADER_H + SHEET_COL_HEAD_H,
    planSheet: { sheetId },
  } as Element;
  const left = SHEET_ROW_HEAD_W;
  const top = SHEET_HEADER_H + SHEET_COL_HEAD_H;
  const drawn: Element[] = [];
  for (const chart of charts) {
    const at = placed(chart);
    // A chart drawn only when its corner is in the window.
    if (!at || at.x >= window.width || at.y >= window.height) continue;
    const table = chart.range
      ? sheetChartTable(
          wb,
          { sheetId, range: chart.range, ...(chart.cols ? { cols: chart.cols } : {}) },
          wb.locale,
        )
      : null;
    const el = sheetChartElement(chart, sheetId, table, at);
    const x = left + at.x;
    const y = top + at.y;
    drawn.push(chartCard(chart, x, y), { ...el, x, y });
  }
  return {
    tab: { id: tab.id, name: tab.name, kind: 'sheet', elements: [frame, ...drawn] },
    sheets: new Map([[sheetId, model]]),
  };
}
