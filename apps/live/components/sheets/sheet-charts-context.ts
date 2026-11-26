'use client';

// What a Sheet needs to draw the charts that sit in it (docs/specs/029-sheets/sheet.md "Charts"): the elements of the
// tab it is on (its charts are among them) and the theme's chart palette. The canvas provides the open tab's; a
// Dashboard slot showing another tab's Sheet provides that tab's, not to be changed from there (`editable` false).
// Kept tiny and free of the sheet chunk: the canvas, in the main bundle, provides it.
import { createContext, useContext } from 'react';
import type { Element, ShapeElement } from '@livedoc/document';
import type { SheetChartRenderer } from '@/components/canvas/sheet-chart-renderer';

export type SheetChartsValue = {
  elements: readonly Element[];
  chartPalette?: readonly string[] | undefined;
  // The charts are on the open tab, so moving, resizing, deleting and inserting land on them.
  editable: boolean;
  // Draws a chart as the canvas draws it (its style, shadow, animations and indicators), from the canvas around the
  // Sheet. Absent where there is no canvas (a test, an export): the chart view alone draws it.
  renderChart?: SheetChartRenderer | undefined;
  // A spreadsheet's charts are its sheet's own objects (docs/specs/029-sheets/charts.md "The model"): `elements` are
  // they, drawn as chart elements, and their changes go back as the sheet's layout writes. Absent on a Plan tab.
  writes?: SheetChartWrites | undefined;
};

export type SheetChartWrites = {
  // A move (`sheetAnchor`) or a resize (`width`, `height`) of one chart, one undo step.
  change: (
    id: string,
    patch: Partial<Pick<ShapeElement, 'sheetAnchor' | 'width' | 'height'>>,
  ) => void;
  remove: (id: string) => void;
  // The chart's menu, at a rect; absent while it has none.
  menu?: ((id: string, at: DOMRect) => void) | undefined;
  // What a chart is called to a screen reader: its alt text, else its type and title.
  labelOf: (id: string) => string;
  // The charts whose range is gone ("No data").
  noData: ReadonlySet<string>;
};

export const SheetChartsContext = createContext<SheetChartsValue | null>(null);

export function useSheetCharts(): SheetChartsValue | null {
  return useContext(SheetChartsContext);
}

// Insert Chart in a Sheet whose tab is not the open one (a Dashboard slot).
export const OPEN_TAB_TO_CHART = "Open the Sheet's tab to add a chart";
