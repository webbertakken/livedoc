'use client';

// The sheet bar (docs/specs/029-sheets/surface.md "Sheet bar"): Add Sheet, All Sheets, then the spreadsheet's tabs
// shown (the hidden ones left out, the open one always in, D179), drawn at the foot of the grid as Google Sheets draws
// its sheets, even with one sheet. A click opens a sheet; arrows move between
// them, as a tab list's do; each tab has its menu (spreadsheet.md "Sheets in the sheet bar"). Each tab shows who else
// is on that sheet, in their colour (sheet-store.md "Live for everyone"). Its end keeps room for the selection's
// summary, drawn there by the open sheet (SheetBarSummary).
import { useRef, useState, type KeyboardEvent } from 'react';
import { lucideMenu, lucidePlus } from '@livedoc/icons/lucide';
import { Tooltip, lucideGlyph } from '@livedoc/ui';
import { shownTabs } from '@/lib/spreadsheet/sheet-bar-places';
import { AllSheetsMenu } from './AllSheetsMenu';
import { CopyToDialog } from './CopyToDialog';
import { SheetBarTab as TabFace } from './SheetBarTab';
import { SheetTabColour } from './SheetTabColour';
import { SheetTabMenu, type SheetTabMenuAt } from './SheetTabMenu';
import type { SheetBarActions } from './useSheetBarActions';
import type { SheetCopyTo } from './useSheetCopyTo';
import { useSheetTabDrag } from './useSheetTabDrag';
import { hiddenTabIds, type SheetTabLooks } from './useSheetTabLooks';

const NO_LOOKS: SheetTabLooks = {};

// The icon step for a row (sizing.md "Icons", icon-row).
const PlusIcon = lucideGlyph(lucidePlus, 16);
const AllSheetsIcon = lucideGlyph(lucideMenu, 16);

export type SheetBarTab = { id: string; name: string };
export type SheetBarPeer = { id: string; name: string; color: string };

export function SheetBar({
  tabs,
  activeId,
  onSelect,
  peers = {},
  summarySlot,
  actions = null,
  looks = NO_LOOKS,
  copyTo = null,
}: {
  // Every sheet tab, hidden ones too (All Sheets lists them).
  tabs: readonly SheetBarTab[];
  activeId: string;
  onSelect: (tabId: string) => void;
  // Who else is on each tab's sheet, by tab id.
  peers?: Readonly<Record<string, readonly SheetBarPeer[]>>;
  // Where the open sheet draws the selection's summary.
  summarySlot?: (element: HTMLDivElement | null) => void;
  // The sheet bar's changes; absent while the sheets are not reachable yet.
  actions?: SheetBarActions | null;
  // Each tab's colour and whether it is hidden (D177).
  looks?: SheetTabLooks;
  // Copy To, everyone's who may read the sheets (D186).
  copyTo?: SheetCopyTo | null;
}) {
  const list = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<SheetTabMenuAt | null>(null);
  // The tab whose colour is being picked, and the tab the picker hangs from.
  const [colouring, setColouring] = useState<{ tabId: string; anchor: HTMLElement } | null>(null);
  // All Sheets' button, which its list opens above.
  const [allButton, setAllButton] = useState<HTMLButtonElement | null>(null);
  const shown = shownTabs(tabs, hiddenTabIds(looks), activeId);
  const focusTab = (id: string) =>
    list.current?.querySelector<HTMLButtonElement>(`[data-sheet-tab="${id}"]`)?.focus();
  const move = (e: KeyboardEvent, at: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = shown[(at + step + shown.length) % shown.length]!;
    onSelect(next.id);
    focusTab(next.id);
  };
  const menuTab = menu ? shown.find((t) => t.id === menu.tabId) : undefined;
  const colourTab = colouring ? tabs.find((t) => t.id === colouring.tabId) : undefined;
  const pickingTab = copyTo?.picking ? tabs.find((t) => t.id === copyTo.picking) : undefined;
  const allAt = allButton?.getBoundingClientRect();
  const drag = useSheetTabDrag({
    list,
    ids: shown.map((t) => t.id),
    canDrag: actions?.canChange ?? false,
    onMove: (tabId, after) => actions?.move(tabId, after),
  });
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
            className="my-auto mr-1 flex size-field items-center justify-center rounded-control text-slate-600 hover:bg-slate-200 focus-visible:outline-2 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <PlusIcon aria-hidden />
          </button>
        </Tooltip>
      ) : null}
      {actions ? (
        <Tooltip label="All Sheets">
          <button
            ref={setAllButton}
            type="button"
            aria-label="All Sheets"
            aria-haspopup="menu"
            aria-expanded={actions.listing}
            data-sheet-all=""
            onClick={() => actions.listSheets(!actions.listing)}
            className="my-auto mr-1 flex size-field items-center justify-center rounded-control text-slate-600 hover:bg-slate-200 focus-visible:outline-2 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <AllSheetsIcon aria-hidden />
          </button>
        </Tooltip>
      ) : null}
      <div
        ref={list}
        role="tablist"
        aria-label="Sheets"
        className="relative flex items-stretch gap-0.5 overflow-x-auto"
      >
        {drag.lineX !== null ? (
          <span
            aria-hidden="true"
            data-sheet-drop-line=""
            className="pointer-events-none absolute inset-y-1 w-0.5 bg-emerald-600"
            style={{ left: drag.lineX }}
          />
        ) : null}
        {shown.map((tab, i) => (
          <TabFace
            key={tab.id}
            tab={tab}
            colour={looks[tab.id]?.colour}
            active={tab.id === activeId}
            peers={peers[tab.id] ?? []}
            renaming={actions?.renaming === tab.id}
            canRename={actions?.canChange ?? false}
            onSelect={() => onSelect(tab.id)}
            onKey={(e) => move(e, i)}
            onMenu={(x, y, fromBar) => setMenu({ tabId: tab.id, x, y, fromBar })}
            onRename={() => actions?.startRename(tab.id)}
            onPointerDown={(e) => drag.onPointerDown(tab.id, e)}
            dragged={drag.dragging === tab.id}
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
          shownCount={shown.length}
          index={shown.findIndex((t) => t.id === menuTab.id)}
          actions={actions}
          onColour={() =>
            // Every tab shown has its face, the picker's anchor.
            setColouring({
              tabId: menuTab.id,
              anchor: list.current!.querySelector<HTMLElement>(
                `[data-sheet-tab-face="${menuTab.id}"]`,
              )!,
            })
          }
          onCopyTo={
            copyTo
              ? (to) =>
                  to === 'new' ? copyTo.copy(menuTab.id, { kind: 'new' }) : copyTo.pick(menuTab.id)
              : undefined
          }
          onClose={() => setMenu(null)}
        />
      ) : null}
      {copyTo?.picking && pickingTab ? (
        <CopyToDialog
          ownerId={copyTo.ownerId}
          currentId={copyTo.documentId}
          sheetName={pickingTab.name}
          onPick={(target) => {
            copyTo.pick(null);
            copyTo.copy(pickingTab.id, { kind: 'existing', ...target });
          }}
          onClose={() => copyTo.pick(null)}
        />
      ) : null}
      {colouring && colourTab && actions ? (
        <SheetTabColour
          name={colourTab.name}
          colour={looks[colourTab.id]?.colour}
          anchor={colouring.anchor}
          onPick={(colour) => actions.colour(colourTab.id, colour)}
          onClose={() => setColouring(null)}
        />
      ) : null}
      {actions?.listing && allAt ? (
        <AllSheetsMenu
          tabs={tabs}
          looks={looks}
          activeId={activeId}
          canShow={actions.canChange}
          at={{ x: allAt.left, y: allAt.top }}
          onPick={(tabId, hidden) => (hidden ? actions.show(tabId) : onSelect(tabId))}
          onClose={() => actions.listSheets(false)}
        />
      ) : null}
    </div>
  );
}
