'use client';

// What a Sheet needs to draw the charts that sit in it (docs/specs/029-sheets/sheet.md "Charts"): the elements of the
// tab it is on (its charts are among them) and the theme's chart palette. The canvas provides the open tab's; a
// Dashboard slot showing another tab's Sheet provides that tab's, not to be changed from there (`editable` false).
// Kept tiny and free of the sheet chunk: the canvas, in the main bundle, provides it.
import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { Element } from '@livedoc/document';
import { useValueStore, useValueStoreSnapshot, type ValueStore } from '@/hooks/ui/useValueStore';
import type { SheetChartRenderer } from '@/components/canvas/sheet-chart-renderer';

export type SheetChartsValue = {
  elements: readonly Element[];
  chartPalette?: readonly string[] | undefined;
  // The charts are on the open tab, so moving, resizing, deleting and inserting land on them.
  editable: boolean;
  // Draws a chart as the canvas draws it (its style, shadow, animations and indicators), from the canvas around the
  // Sheet. Absent where there is no canvas (a test, an export): the chart view alone draws it.
  renderChart?: SheetChartRenderer | undefined;
};

// The canvas provides it around every element view, and its elements change with every edit: it travels in a store,
// so the context holds still and only the Sheets that read it re-render
// (docs/specs/008-canvas/canvas-performance.md "The contexts around the element layer hold still").
const SheetChartsContext = createContext<ValueStore<SheetChartsValue> | null>(null);

export function SheetChartsProvider({
  value,
  children,
}: {
  value: SheetChartsValue;
  children: ReactNode;
}) {
  return createElement(SheetChartsContext.Provider, { value: useValueStore(value) }, children);
}

export function useSheetCharts(): SheetChartsValue | null {
  return useValueStoreSnapshot(useContext(SheetChartsContext));
}

// Insert Chart in a Sheet whose tab is not the open one (a Dashboard slot).
export const OPEN_TAB_TO_CHART = "Open the Sheet's tab to add a chart";
