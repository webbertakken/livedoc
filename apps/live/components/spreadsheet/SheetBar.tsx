'use client';

// The sheet bar (docs/specs/029-sheets/surface.md "Sheet bar"): Add Sheet, then the spreadsheet's tabs, drawn at the
// foot of the grid as Google Sheets draws its sheets, even with one sheet. A click opens a sheet; arrows move between
// them, as a tab list's do; each tab has its menu (spreadsheet.md "Sheets in the sheet bar"). Each tab shows who else
// is on that sheet, in their colour (sheet-store.md "Live for everyone"). Its end keeps room for the selection's
// summary, drawn there by the open sheet (SheetBarSummary).
import { useRef, useState, type KeyboardEvent } from 'react';
import { Tooltip } from '@livedoc/ui';
import { SheetBarTab as TabFace } from './SheetBarTab';
import { SheetTabMenu, type SheetTabMenuAt } from './SheetTabMenu';
import type { SheetBarActions } from './useSheetBarActions';

export type SheetBarTab = { id: string; name: string };
export type SheetBarPeer = { id: string; name: string; color: string };

export function SheetBar({
  tabs,
  activeId,
  onSelect,
  peers = {},
  summarySlot,
  actions = null,
}: {
  tabs: readonly SheetBarTab[];
  activeId: string;
  onSelect: (tabId: string) => void;
  // Who else is on each tab's sheet, by tab id.
  peers?: Readonly<Record<string, readonly SheetBarPeer[]>>;
  // Where the open sheet draws the selection's summary.
  summarySlot?: (element: HTMLDivElement | null) => void;
  // The sheet bar's changes; absent while the sheets are not reachable yet.
  actions?: SheetBarActions | null;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<SheetTabMenuAt | null>(null);
  const focusTab = (id: string) =>
    list.current?.querySelector<HTMLButtonElement>(`[data-sheet-tab="${id}"]`)?.focus();
  const move = (e: KeyboardEvent, at: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = tabs[(at + step + tabs.length) % tabs.length]!;
    onSelect(next.id);
    focusTab(next.id);
  };
  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : undefined;
  return (
    <div
      data-region="tabs"
      className="flex h-[38px] shrink-0 items-stretch border-t border-slate-200 bg-slate-50 px-2 dark:border-slate-700 dark:bg-slate-900"
    >
      {actions?.canChange ? (
        <Tooltip label="Add Sheet">
          <button
            type="button"
            aria-label="Add Sheet"
            data-sheet-add=""
            onClick={() => actions.add('end')}
            className="my-1 mr-1 flex w-8 items-center justify-center rounded-sm text-lg text-slate-600 hover:bg-slate-200 focus-visible:outline-2 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            +
          </button>
        </Tooltip>
      ) : null}
      <div
        ref={list}
        role="tablist"
        aria-label="Sheets"
        className="flex items-stretch gap-0.5 overflow-x-auto"
      >
        {tabs.map((tab, i) => (
          <TabFace
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            peers={peers[tab.id] ?? []}
            renaming={actions?.renaming === tab.id}
            canRename={actions?.canChange ?? false}
            onSelect={() => onSelect(tab.id)}
            onKey={(e) => move(e, i)}
            onMenu={(x, y, fromBar) => setMenu({ tabId: tab.id, x, y, fromBar })}
            onRename={() => actions?.startRename(tab.id)}
            onRenamed={(typed) => {
              actions?.startRename(null);
              if (typed !== null) actions?.rename(tab.id, typed);
              requestAnimationFrame(() => focusTab(tab.id));
            }}
          />
        ))}
      </div>
      <div ref={summarySlot} data-sheet-summary className="ml-auto flex shrink-0 items-center" />
      {menu && menuTab && actions ? (
        <SheetTabMenu
          at={menu}
          name={menuTab.name}
          sheetCount={tabs.length}
          actions={actions}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
