'use client';

// The grid's keys only a workbook has (docs/specs/029-sheets/grid-and-editing.md "Moving around"): Alt+Up and
// Alt+Down, Ctrl+Shift+Page Up and Page Down open the previous and next sheet; Alt+Shift+Q puts focus on the
// selection's summary; Ctrl+Alt+Shift+M takes it out to the toolbar (D137). The surface knows the sheets; the open
// sheet's grid hears the keys.
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { SheetSurfaceKeys } from '@/components/sheets/useSheetGridKeys';
import { regionTarget, shownRegions } from '@/hooks/ui/useRegionCycle';
import { debugLog } from '@/lib/debug-log';
import type { SheetBarTab } from './SheetBar';
import { useSummarySlot } from './summary-slot';

/** The tab a step from the open one lands on, or null past either end. */
export function tabAfter(
  tabs: readonly SheetBarTab[],
  openId: string,
  step: -1 | 1,
): SheetBarTab | null {
  const at = tabs.findIndex((tab) => tab.id === openId);
  return at < 0 ? null : (tabs[at + step] ?? null);
}

/** Opens the sheet a step away, as the surface's sheet bar would. */
export const SheetStepContext = createContext<((step: -1 | 1) => void) | null>(null);

/** The surface's step: the previous or next tab opened, nothing past either end. */
export function useSheetStep(
  tabs: readonly SheetBarTab[],
  openId: string,
  onSelect: (tabId: string) => void,
): (step: -1 | 1) => void {
  return useCallback(
    (step) => {
      const next = tabAfter(tabs, openId, step);
      debugLog('[workbook] sheet step', { step, to: next?.id ?? null });
      if (next) onSelect(next.id);
    },
    [tabs, openId, onSelect],
  );
}

/** The open sheet's workbook keys, for its grid. */
export function useSpreadsheetSurfaceKeys(): SheetSurfaceKeys {
  const step = useContext(SheetStepContext);
  const slot = useSummarySlot();
  return useMemo(
    () => ({
      stepSheet: (by) => step?.(by),
      focusSummary: () => {
        const summary = slot?.querySelector<HTMLButtonElement>('button[aria-haspopup]');
        debugLog('[workbook] summary focus', { shown: !!summary });
        summary?.focus();
      },
      leaveGrid: () => {
        const toolbar = shownRegions(document).find((root) => root.dataset.region === 'toolbar');
        const target = toolbar ? regionTarget(toolbar) : null;
        debugLog('[workbook] leave grid', { to: target ? 'toolbar' : null });
        target?.focus();
      },
    }),
    [step, slot],
  );
}
