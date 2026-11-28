'use client';

// A Sheet Chart from a spreadsheet in a Dashboard slot (docs/specs/029-sheets/plan-links.md "The Sheet Chart from a
// spreadsheet", D508): the chart drawn by the spreadsheet's own chart code at the slot's size, from the sheet as the
// page last read it (D505), so an edit to its cells or to the chart there shows here at the next read. An Editor
// changes it from Change Chart in the slot's cog (SlotSection); anyone may look.
import { useMemo, useRef } from 'react';
import { CHART_TYPE_LABELS, chartTypeOf, type DashboardSheetChart } from '@livedoc/document';
import { DataChartView } from '@/components/canvas/DataChartView';
import { useCanvasSurface } from '@/components/canvas/CanvasSurfaceContext';
import { planPalette } from '../plan-palette';
import { Missing, useBoxSize } from './DashboardSlotContent';
import { linkedChartElement } from './spreadsheet-chart';
import { TabWaiting } from './TabWaiting';
import { useFigureSheetRead } from './useLinkedSheetRead';

const MUTED = 'text-slate-500 dark:text-slate-400';

export function DashboardLinkedChart({
  slotId,
  content,
}: {
  slotId: string;
  content: DashboardSheetChart;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useBoxSize(ref);
  const read = useFigureSheetRead(content);
  const palette = planPalette(useCanvasSurface(), {});
  const version = read.state === 'ready' ? read.version : -1;
  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const element = useMemo(
    () =>
      read.state === 'ready' && width > 0 && height > 0
        ? linkedChartElement(content, read, slotId, { width, height })
        : undefined,
    // The read changes in place: its version says when it is to be drawn again.
    // oxlint-disable-next-line react/exhaustive-deps
    [content, version, slotId, width, height],
  );
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden">
      {body()}
    </div>
  );
  function body() {
    switch (read.state) {
      case 'ready':
        if (element === null) return <Missing message="This chart was deleted." slotId={slotId} />;
        return element ? (
          <div
            role="group"
            aria-label={`${CHART_TYPE_LABELS[chartTypeOf(element) ?? 'column']} chart`}
            className="absolute inset-0"
          >
            <DataChartView element={element} textColor={palette.text} />
          </div>
        ) : null;
      case 'gone':
        return <Missing message="This sheet was deleted." slotId={slotId} />;
      case 'failed':
        return <TabWaiting name="the chart" status="failed" onRetry={read.retry} />;
      case 'denied':
      case 'too-large':
        return (
          <div className="flex h-full items-center justify-center p-4 text-center">
            <span className={`text-body ${MUTED}`}>
              {read.state === 'denied'
                ? 'You don’t have access to this spreadsheet.'
                : 'This spreadsheet is too large to read here.'}
            </span>
          </div>
        );
      default:
        return <TabWaiting name="the chart" status="loading" onRetry={() => {}} />;
    }
  }
}
