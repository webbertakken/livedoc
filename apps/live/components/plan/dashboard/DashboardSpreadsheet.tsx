'use client';

// A Spreadsheet slot (docs/specs/029-sheets/plan-links.md "The Spreadsheet slot", D507): a spreadsheet's first visible
// sheet, read-only, under a header of its name and Open, which opens the spreadsheet in a new browser tab. Until an
// Editor chooses the spreadsheet it offers Choose a Spreadsheet; anyone else waits for it. Read again as a figure is
// (D505), so an edit there shows here within the read's interval.
import { useState, type ReactNode } from 'react';
import { SheetArt } from '@/components/sheets/sheet-art';
import { SpreadsheetSheetPicture } from '@/components/spreadsheet/SpreadsheetSheetPicture';
import { useDashboard } from './dashboard-context';
import { useSlotSettings } from './slot-menu';
import { SpreadsheetSlotSource } from './SpreadsheetSlotSource';
import { TabWaiting } from './TabWaiting';
import { useSpreadsheetSlotRead } from './useSpreadsheetSlotRead';

const MUTED = 'text-slate-500 dark:text-slate-400';

/** Opens a spreadsheet in a new browser tab. */
export function openSpreadsheet(documentId: string): void {
  window.open(`/document/${encodeURIComponent(documentId)}`, '_blank', 'noopener');
}

export function DashboardSpreadsheet({
  slotId,
  documentId,
}: {
  slotId: string;
  // '' until one is chosen.
  documentId: string;
}) {
  const { canEdit, actions } = useDashboard();
  const slot = useSlotSettings();
  const { read, retry } = useSpreadsheetSlotRead(documentId);
  const [pickerAt, setPickerAt] = useState<HTMLElement | null>(null);
  const heading =
    read.state === 'ready'
      ? `${read.title} · ${read.name}`
      : read.state === 'empty'
        ? read.name
        : 'Spreadsheet';
  const opens = !!documentId && (read.state === 'ready' || read.state === 'empty');
  const choose = canEdit ? (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={(e) => setPickerAt(e.currentTarget)}
      className="h-field cursor-pointer rounded-control border border-slate-200 bg-white px-3 text-body text-slate-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500/60 dark:hover:text-brand-300"
    >
      Choose a Spreadsheet
    </button>
  ) : null;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-surface border border-slate-900/[0.07] bg-white/[0.72] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.22)] dark:border-white/[0.08] dark:bg-slate-900/60">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-900/[0.06] pl-3 pr-2 dark:border-white/[0.06]">
        <span aria-hidden className="shrink-0 text-slate-500 dark:text-slate-400">
          <SheetArt size={16} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-panel-title text-slate-800 dark:text-slate-100">
          {heading}
        </h3>
        {opens ? (
          <button
            type="button"
            onClick={() => openSpreadsheet(documentId)}
            className="h-row shrink-0 cursor-pointer rounded-control px-2 text-body text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300 dark:hover:bg-brand-500/10"
          >
            Open
          </button>
        ) : null}
        {slot?.cog}
      </div>
      <div className="relative min-h-0 flex-1">{body()}</div>
      {pickerAt ? (
        <SpreadsheetSlotSource
          anchor={pickerAt}
          onPick={(id) => actions.setSlotContent(slotId, { type: 'spreadsheet', documentId: id })}
          onClose={() => setPickerAt(null)}
        />
      ) : null}
    </div>
  );
  function body() {
    if (!documentId)
      return (
        <Centred>
          {choose ?? (
            <span className={`text-supporting ${MUTED}`}>Waiting for its spreadsheet.</span>
          )}
        </Centred>
      );
    switch (read.state) {
      case 'ready':
        return (
          <div className="absolute inset-0">
            <SpreadsheetSheetPicture
              wb={read.wb}
              sheetId={read.sheetId}
              title={read.title}
              label={heading}
              version={read.version}
            />
          </div>
        );
      case 'loading':
        return <TabWaiting name="the sheet" status="loading" onRetry={retry} />;
      case 'failed':
        return <TabWaiting name="the sheet" status="failed" onRetry={retry} />;
      default:
        return (
          <Centred>
            <span className={`text-body ${MUTED}`}>
              {read.state === 'denied'
                ? 'You don’t have access to this spreadsheet.'
                : read.state === 'too-large'
                  ? 'This spreadsheet is too large to read here.'
                  : 'This spreadsheet has no sheets to show.'}
            </span>
            {choose}
          </Centred>
        );
    }
  }
}

function Centred({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      {children}
    </div>
  );
}
