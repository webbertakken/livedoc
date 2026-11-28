'use client';

// Choose a Chart (docs/specs/026-plan/plan-tabs.md "Sheet Chart"), an Editor's: a popover of the document's Sheets and
// the person's spreadsheets (docs/specs/029-sheets/plan-links.md "The Sheet Chart from a spreadsheet"), then, for the
// sheet picked, the charts already drawn from it or a new one over a range typed as A1, of a type. A Sheet of the
// document hands the slot its chart element (a copy of one); a spreadsheet's sheet hands it the chart's id, or the
// range and type (D508). Either closes the picker.
import { useMemo, useState } from 'react';
import {
  CHART_TYPE_LABELS,
  CHART_TYPES,
  type ChartType,
  type DashboardSheetChart,
  type ShapeElement,
} from '@livedoc/document';
import type { Sheet } from '@livedoc/sheets';
import { CompactEmptyState, lucideGlyph } from '@livedoc/ui';
import { lucideChartColumn } from '@livedoc/icons/lucide';
import { AnchoredPopover } from '@/components/primitives/AnchoredPopover';
import {
  DONE,
  FIELD,
  MUTED_LINE,
  ON,
  ROW,
  SECTION,
  SheetList,
  useSheetPicker,
} from './sheet-source-parts';
import { TabWaiting } from './TabWaiting';
import {
  NOT_A_RANGE,
  newSlotChart,
  sheetChartLabel,
  sheetChartsOf,
  slotChartFrom,
} from './sheet-chart-choice';
import { linkedChartLabel, linkedSheetCharts, newLinkedChart } from './spreadsheet-chart';
import { SpreadsheetSheetSource } from './SpreadsheetSheetSource';
import { retryLinkedRead } from './linked-sheets';
import { useLinkedRead } from './useLinkedSheetRead';

const ChartGlyph = lucideGlyph(lucideChartColumn, 14);

export function SheetChartSource({
  anchor,
  initialSheetId = '',
  initialDocumentId = '',
  onChoose,
  onChooseLinked,
  onClose,
}: {
  anchor: HTMLElement;
  // The sheet the slot's chart reads now (Change Chart), picked to start: of a spreadsheet when `initialDocumentId`
  // names one, else of the document.
  initialSheetId?: string;
  initialDocumentId?: string;
  onChoose: (chart: ShapeElement) => void;
  onChooseLinked: (chart: DashboardSheetChart) => void;
  onClose: () => void;
}) {
  // The sheet picked: a spreadsheet's when `documentId` is set, else one of the document's (its `sheetId`).
  const [pick, setPick] = useState({ documentId: initialDocumentId, sheetId: initialSheetId });
  const sheetId = pick.documentId ? '' : pick.sheetId;
  const setSheetId = (id: string) => setPick({ documentId: '', sheetId: id });
  const picker = useSheetPicker(sheetId);
  const { read, tabs } = picker;
  const charts = useMemo(() => (sheetId ? sheetChartsOf(tabs, sheetId) : []), [tabs, sheetId]);
  const choose = (chart: ShapeElement) => {
    onChoose(chart);
    onClose();
  };
  return (
    <AnchoredPopover anchor={anchor} name="Choose a Chart" width={320} onClose={onClose}>
      <div className="flex max-h-[min(70vh,32rem)] flex-col gap-3 overflow-y-auto rounded-menu border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <SheetList picker={picker} sheetId={sheetId} onPick={setSheetId} />
        <SpreadsheetSheetSource
          documentId={pick.documentId}
          sheetId={pick.documentId ? pick.sheetId : ''}
          onPick={setPick}
        />
        {pick.documentId ? (
          <LinkedCharts
            documentId={pick.documentId}
            sheetId={pick.sheetId}
            onChoose={(chart) => {
              onChooseLinked(chart);
              onClose();
            }}
          />
        ) : read.state === 'ready' ? (
          <>
            <section aria-label="Its Charts" className="flex flex-col gap-1">
              <h3 className={SECTION}>Its Charts</h3>
              {charts.length === 0 ? (
                <CompactEmptyState
                  size="small"
                  icon={<ChartGlyph />}
                  title="No charts yet"
                  description="Charts on this sheet show up here; New Chart below makes one."
                />
              ) : (
                charts.map((el) => (
                  <button
                    key={el.id}
                    type="button"
                    onClick={() => choose(slotChartFrom(el))}
                    className={ROW}
                  >
                    <span className="truncate">{sheetChartLabel(el, read.sheet)}</span>
                  </button>
                ))
              )}
            </section>
            <NewChart
              make={(text, kind) => {
                const chart = newSlotChart(read.sheet, text, kind);
                if (chart) choose(chart);
                return !!chart;
              }}
            />
          </>
        ) : read.state === 'loading' ? (
          <p className={MUTED_LINE}>Loading {read.name}…</p>
        ) : read.state === 'failed' ? (
          <TabWaiting name={read.name} status="failed" onRetry={read.retry} />
        ) : null}
      </div>
    </AnchoredPopover>
  );
}

// A spreadsheet's sheet's charts and New Chart, read through its link (D505).
function LinkedCharts({
  documentId,
  sheetId,
  onChoose,
}: {
  documentId: string;
  sheetId: string;
  onChoose: (chart: DashboardSheetChart) => void;
}) {
  const read = useLinkedRead(documentId, sheetId);
  if (read.state === 'loading') return <p className={MUTED_LINE}>Loading the sheet…</p>;
  if (read.state === 'failed')
    return (
      <TabWaiting
        name="the sheet"
        status="failed"
        onRetry={() => retryLinkedRead(documentId, sheetId)}
      />
    );
  if (read.state !== 'ready')
    return (
      <p className={MUTED_LINE}>
        {read.state === 'denied'
          ? 'You don’t have access to this spreadsheet.'
          : 'This spreadsheet is too large to read here.'}
      </p>
    );
  if (!read.sheet) return <p className={MUTED_LINE}>This sheet was deleted.</p>;
  const sheet: Sheet = read.sheet;
  const charts = linkedSheetCharts(sheet);
  return (
    <>
      <section aria-label="Its Charts" className="flex flex-col gap-1">
        <h3 className={SECTION}>Its Charts</h3>
        {charts.length === 0 ? (
          <CompactEmptyState
            size="small"
            icon={<ChartGlyph />}
            title="No charts yet"
            description="Charts on this sheet show up here; New Chart below makes one."
          />
        ) : (
          charts.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChoose({ type: 'sheet-chart', documentId, sheetId, chartId: c.id })}
              className={ROW}
            >
              <span className="truncate">{linkedChartLabel(c, sheet)}</span>
            </button>
          ))
        )}
      </section>
      <NewChart
        make={(text, kind) => {
          const chart = newLinkedChart(documentId, sheet, text, kind);
          if (chart) onChoose(chart);
          return !!chart;
        }}
      />
    </>
  );
}

function NewChart({
  make,
}: {
  // Makes the chart over the range typed and hands it on; false when it is not a range of the sheet.
  make: (text: string, kind: ChartType) => boolean;
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ChartType>('column');
  const [problem, setProblem] = useState(false);
  return (
    <form
      aria-label="New Chart"
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setProblem(!make(text, kind));
      }}
    >
      <h3 className={SECTION}>New Chart</h3>
      <label className="flex items-center gap-2 px-1">
        <span className="w-10 text-supporting text-slate-500 dark:text-slate-400">Range</span>
        <input
          aria-label="Range"
          value={text}
          placeholder="A1:C6"
          onChange={(e) => {
            setText(e.target.value.toUpperCase());
            setProblem(false);
          }}
          className={FIELD.replace('w-20', 'w-28')}
        />
        {problem ? (
          <span role="alert" className="text-supporting text-red-600 dark:text-red-400">
            {NOT_A_RANGE}
          </span>
        ) : null}
      </label>
      <div className="flex items-center gap-2 px-1">
        <span className="w-10 text-supporting text-slate-500 dark:text-slate-400">Type</span>
        <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-1">
          {CHART_TYPES.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex h-chip cursor-pointer items-center rounded-full border px-2 text-supporting transition ${kind === k ? `border-brand-400 ${ON} dark:border-brand-500/60` : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              {CHART_TYPE_LABELS[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <button type="submit" className={DONE}>
          Add Chart
        </button>
      </div>
    </form>
  );
}
