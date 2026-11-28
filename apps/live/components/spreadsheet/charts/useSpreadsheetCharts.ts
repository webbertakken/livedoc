'use client';

// A spreadsheet's charts (docs/specs/029-sheets/charts.md "The model", "Inserting", "Working with a chart"): the open
// sheet's chart objects handed to the grid's charts layer as chart elements (drawn by LiveDoc's chart code, as a Plan
// chart is), their moves, resizes and deletes written back as the sheet's layout writes, each one undo step, and
// Insert › Chart making one from the selection.
import { useCallback, useMemo } from 'react';
import { CHART_TYPE_LABELS } from '@livedoc/document';
import { sheetChartElement } from '@livedoc/plan-art';
import {
  AGENT_LOCALE,
  filteredOutRows,
  makeAxisIds,
  slicerDrawnFilters,
  posRangeOf,
  sheetChartTable,
  SHEET_CHART_SIZE_MAX,
  SHEET_CHART_SIZE_MIN,
  type SheetChart,
  type SheetObject,
} from '@livedoc/sheets';
import type { SheetController } from '@/components/sheets/sheet-controller';
import type { SheetChartsValue, SheetChartWrites } from '@/components/sheets/sheet-charts-context';
import { chartRangeOf, markPlacedChart, NOTHING_TO_CHART } from '@/components/sheets/sheet-charts';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import {
  anchorAt,
  anchorPx,
  labelsAreDates,
  newSheetChart,
  suggestChartType,
} from './sheet-chart-place';

const SIZE = (v: number, least: number) =>
  Math.round(Math.min(SHEET_CHART_SIZE_MAX, Math.max(least, v)));

// What a chart is called to a screen reader: its alt text, else its type and title.
export function chartLabel(chart: SheetChart): string {
  if (chart.alt?.trim()) return chart.alt.trim();
  const kind = `${CHART_TYPE_LABELS[chart.type]} chart`;
  return chart.title?.trim() ? `${kind}: ${chart.title.trim()}` : kind;
}

export function useSpreadsheetCharts(
  c: SheetController,
  // Opens the Chart Editor on a chart (charts.md "Chart Editor").
  onEdit?: (id: string) => void,
): {
  value: SheetChartsValue | null;
  insertChart: () => void;
  // A chart set whole (the Chart Editor's changes), one undo step.
  change: (next: SheetChart) => void;
} {
  const { sheet, workbook, version, geometry, canShape, write, ownSlicers } = c;
  const objects = sheet.layout.objects;
  const charts = useMemo(
    () => (objects ?? []).filter((x): x is SheetChart => x.kind === 'chart'),
    [objects],
  );
  // The rows this person's slicers hide, for each chart whose range is a slicer's exactly (data-tools.md "Slicers",
  // D487).
  const slicedRows = useCallback(
    (range: NonNullable<SheetChart['range']>) => {
      const same = slicerDrawnFilters(sheet.layout, ownSlicers).filter(
        (f) => f.r1 === range.r1 && f.c1 === range.c1 && f.r2 === range.r2 && f.c2 === range.c2,
      );
      return same.length ? filteredOutRows(workbook, sheet.id, null, same) : null;
    },
    [sheet, workbook, ownSlicers],
  );
  // Read again whenever a value or the layout moves on: a series' look follows its column.
  const elements = useMemo(
    () =>
      charts.map((chart) => {
        const hide = chart.range ? slicedRows(chart.range) : null;
        return sheetChartElement(
          chart,
          sheet.id,
          chart.range
            ? sheetChartTable(
                workbook,
                {
                  sheetId: sheet.id,
                  range: chart.range,
                  ...(chart.cols ? { cols: chart.cols } : {}),
                  ...(hide ? { hide } : {}),
                },
                AGENT_LOCALE,
              )
            : null,
          anchorPx(chart.at, sheet.layout, geometry),
        );
      }),
    // oxlint-disable-next-line react/exhaustive-deps -- version: the workbook's values moved on in place
    [charts, sheet, workbook, geometry, slicedRows, version],
  );

  const put = useCallback(
    (id: string, object: SheetObject | null, what: string) => {
      const ok = write({ kind: 'layout', changes: [{ k: 'object', id, object }] }, 'Chart');
      debugLog(`[sheet-charts] ${what} sheet=${sheet.id} chart=${id} ok=${ok}`);
      return ok;
    },
    [write, sheet.id],
  );

  const writes = useMemo((): SheetChartWrites => {
    const byId = new Map(charts.map((x) => [x.id, x]));
    return {
      change: (id, patch) => {
        const cur = byId.get(id);
        if (!cur) return;
        const next: SheetChart = {
          ...cur,
          ...(patch.sheetAnchor ? { at: anchorAt(patch.sheetAnchor, sheet.layout, geometry) } : {}),
          ...(patch.width !== undefined
            ? { width: SIZE(patch.width, SHEET_CHART_SIZE_MIN.width) }
            : {}),
          ...(patch.height !== undefined
            ? { height: SIZE(patch.height, SHEET_CHART_SIZE_MIN.height) }
            : {}),
        };
        put(id, next, patch.sheetAnchor ? 'moved' : 'resized');
      },
      remove: (id) => void put(id, null, 'removed'),
      ...(onEdit ? { menu: (id: string) => onEdit(id), menuLabel: 'Edit Chart' } : {}),
      labelOf: (id) => {
        const cur = byId.get(id);
        return cur ? chartLabel(cur) : 'Chart';
      },
      noData: new Set(charts.filter((x) => !x.range).map((x) => x.id)),
    };
  }, [charts, sheet.layout, geometry, put, onEdit]);

  const insertChart = useCallback(() => {
    if (!canShape) return;
    const pick = chartRangeOf(workbook, sheet, c.selectionNow());
    if (!pick) {
      c.announce(NOTHING_TO_CHART);
      return;
    }
    const table = sheetChartTable(workbook, { sheetId: sheet.id, ...pick }, AGENT_LOCALE);
    const at = posRangeOf(sheet.layout, pick.range);
    const type = table ? suggestChartType(table, labelsAreDates(sheet, pick)) : 'column';
    // One column right of the data, level with its top row.
    const col = at ? Math.min(at.c2 + 1, sheet.layout.cols.length - 1) : 0;
    const anchor = {
      r: sheet.layout.rows[at?.r1 ?? 0]!,
      c: sheet.layout.cols[col]!,
      dx: 0,
      dy: 0,
    };
    const [id] = makeAxisIds(1, Math.random, new Set(charts.map((x) => x.id)));
    // Selected as it draws, ready to move (SheetChartsLayer).
    markPlacedChart(id!);
    if (put(id!, newSheetChart(id!, type, pick, anchor), 'inserted')) {
      track('Spreadsheet', 'Added', CHART_TYPE_LABELS[type]);
      // Inserted with the Chart Editor open on it (charts.md "Inserting").
      onEdit?.(id!);
    }
  }, [c, canShape, workbook, sheet, charts, put, onEdit]);
  const change = useCallback((next: SheetChart) => void put(next.id, next, 'changed'), [put]);

  return {
    value: { elements, editable: canShape, writes },
    insertChart,
    change,
  };
}
