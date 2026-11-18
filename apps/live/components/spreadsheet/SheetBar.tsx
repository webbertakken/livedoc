'use client';

// The sheet bar (docs/specs/029-sheets/surface.md "Sheet bar"): the spreadsheet's tabs, drawn at the foot of the grid
// as Google Sheets draws its sheets, even with one sheet. A click opens a sheet; arrows move between them, as a tab
// list's do. Add Sheet, All Sheets, each tab's menu and the summary arrive with the grid surface (plan 0020 Phase 8).
import { useRef, type KeyboardEvent } from 'react';

export type SheetBarTab = { id: string; name: string };

export function SheetBar({
  tabs,
  activeId,
  onSelect,
}: {
  tabs: readonly SheetBarTab[];
  activeId: string;
  onSelect: (tabId: string) => void;
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
    <div className="flex h-[38px] shrink-0 items-stretch border-t border-slate-200 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-900">
      <div ref={list} role="tablist" aria-label="Sheets" className="flex items-stretch gap-0.5 overflow-x-auto">
        {tabs.map((tab, i) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-sheet-tab={tab.id}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(e) => move(e, i)}
              className={
                active
                  ? 'max-w-48 truncate bg-white px-4 text-sm font-medium text-emerald-800 shadow-sm focus-visible:outline-2 dark:bg-slate-800 dark:text-emerald-300'
                  : 'max-w-48 truncate px-4 text-sm text-slate-700 hover:bg-slate-200 focus-visible:outline-2 dark:text-slate-300 dark:hover:bg-slate-800'
              }
            >
              {tab.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
