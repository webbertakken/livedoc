'use client';

// All Sheets (docs/specs/029-sheets/surface.md "Sheet bar"): every sheet of the spreadsheet in the tabs' order, the
// open one ticked, the hidden ones dimmed with "Hidden". Picking a sheet opens it; picking a hidden one shows it
// first, for an Editor; for anyone else a hidden sheet stays dimmed and does nothing (D178, D180).
import { ContextMenu } from '@/components/palette/ContextMenu';
import { MenuHeader } from '@/components/primitives/PortalMenu';
import type { SheetBarTab } from './SheetBar';
import type { SheetTabLooks } from './useSheetTabLooks';

const ROW =
  'flex min-h-row w-full items-center gap-2 px-3 text-left text-body pointer-coarse:min-h-11';

export function AllSheetsMenu({
  tabs,
  looks,
  activeId,
  canShow,
  at,
  onPick,
  onClose,
}: {
  tabs: readonly SheetBarTab[];
  looks: SheetTabLooks;
  activeId: string;
  // Whether a hidden sheet may be shown (an Editor).
  canShow: boolean;
  at: { x: number; y: number };
  onPick: (tabId: string, hidden: boolean) => void;
  onClose: () => void;
}) {
  return (
    <ContextMenu position={at} label="All Sheets" onClose={onClose} anchorBottom>
      <MenuHeader title="All Sheets" />
      {tabs.map((tab) => {
        const hidden = looks[tab.id]?.hidden === true;
        const open = tab.id === activeId;
        const face = (
          <>
            <span aria-hidden="true" className="flex w-5 shrink-0 justify-center">
              {open ? '✓' : ''}
            </span>
            <span className="min-w-0 flex-1 truncate">{tab.name}</span>
            {hidden ? (
              <span className="text-supporting text-slate-500 dark:text-slate-400">Hidden</span>
            ) : null}
          </>
        );
        if (hidden && !canShow)
          return (
            <span
              key={tab.id}
              aria-disabled
              data-all-sheets={tab.id}
              className={`${ROW} cursor-not-allowed text-slate-500 dark:text-slate-400`}
            >
              {face}
            </span>
          );
        return (
          <button
            key={tab.id}
            type="button"
            data-all-sheets={tab.id}
            aria-current={open ? 'true' : undefined}
            onClick={() => {
              onClose();
              onPick(tab.id, hidden);
            }}
            className={`${ROW} cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
              hidden ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {face}
          </button>
        );
      })}
    </ContextMenu>
  );
}
