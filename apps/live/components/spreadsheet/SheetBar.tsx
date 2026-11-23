'use client';

// The sheet bar (docs/specs/029-sheets/surface.md "Sheet bar"): the spreadsheet's tabs, drawn at the foot of the grid
// as Google Sheets draws its sheets, even with one sheet. A click opens a sheet; arrows move between them, as a tab
// list's do. Each tab shows who else is on that sheet, in their colour (sheet-store.md "Live for everyone"). Its end
// keeps room for the selection's summary, drawn there by the open sheet (SheetBarSummary).
import { useRef, type KeyboardEvent } from 'react';
import { Tooltip } from '@livedoc/ui';

export type SheetBarTab = { id: string; name: string };
export type SheetBarPeer = { id: string; name: string; color: string };

// Faces a tab shows before the rest are counted ("+2").
export const SHEET_BAR_FACES_MAX = 3;

function Faces({ peers }: { peers: readonly SheetBarPeer[] }) {
  if (!peers.length) return null;
  const shown = peers.slice(0, SHEET_BAR_FACES_MAX);
  const more = peers.length - shown.length;
  return (
    <span aria-hidden="true" className="ml-2 inline-flex items-center -space-x-1">
      {shown.map((p) => (
        <span
          key={p.id}
          data-sheet-peer={p.id}
          className="inline-block size-2.5 rounded-full ring-2 ring-white dark:ring-slate-900"
          style={{ backgroundColor: p.color }}
        />
      ))}
      {more > 0 ? (
        <span className="pl-1.5 text-[11px] text-slate-600 dark:text-slate-300">+{more}</span>
      ) : null}
    </span>
  );
}

// What a screen reader hears for a tab: its name, and who is on it.
export function sheetTabLabel(name: string, peers: readonly SheetBarPeer[]): string {
  return peers.length ? `${name}, also here: ${peers.map((p) => p.name).join(', ')}` : name;
}

export function SheetBar({
  tabs,
  activeId,
  onSelect,
  peers = {},
  summarySlot,
}: {
  tabs: readonly SheetBarTab[];
  activeId: string;
  onSelect: (tabId: string) => void;
  // Who else is on each tab's sheet, by tab id.
  peers?: Readonly<Record<string, readonly SheetBarPeer[]>>;
  // Where the open sheet draws the selection's summary.
  summarySlot?: (element: HTMLDivElement | null) => void;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  const move = (e: KeyboardEvent, at: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = tabs[(at + step + tabs.length) % tabs.length]!;
    onSelect(next.id);
    list.current?.querySelector<HTMLButtonElement>(`[data-sheet-tab="${next.id}"]`)?.focus();
  };
  return (
    <div
      data-region="tabs"
      className="flex h-[38px] shrink-0 items-stretch border-t border-slate-200 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-900"
    >
      <div
        ref={list}
        role="tablist"
        aria-label="Sheets"
        className="flex items-stretch gap-0.5 overflow-x-auto"
      >
        {tabs.map((tab, i) => {
          const active = tab.id === activeId;
          const here = peers[tab.id] ?? [];
          // Who is here, named on hover as the tab is named to a screen reader.
          const label = here.length ? sheetTabLabel(tab.name, here) : '';
          return (
            <Tooltip key={tab.id} label={label}>
              <button
                type="button"
                role="tab"
                data-sheet-tab={tab.id}
                aria-selected={active}
                aria-label={label || undefined}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(e) => move(e, i)}
                className={
                  active
                    ? 'flex max-w-48 items-center bg-white px-4 text-sm font-medium text-emerald-800 shadow-sm focus-visible:outline-2 dark:bg-slate-800 dark:text-emerald-300'
                    : 'flex max-w-48 items-center px-4 text-sm text-slate-700 hover:bg-slate-200 focus-visible:outline-2 dark:text-slate-300 dark:hover:bg-slate-800'
                }
              >
                <span className="truncate">{tab.name}</span>
                <Faces peers={here} />
              </button>
            </Tooltip>
          );
        })}
      </div>
      <div ref={summarySlot} data-sheet-summary className="ml-auto flex shrink-0 items-center" />
    </div>
  );
}
