'use client';

// View › Full Screen on a spreadsheet (docs/specs/029-sheets/surface.md "Layout", D187, D188): the title row, the menu
// bar and the toolbar step aside, the formula bar, the grid and the sheet bar stay; Esc in the grid or the Exit Full
// Screen button brings them back. The person's own view for the page, never saved or sent, off as the spreadsheet
// opens; not the browser's full screen.
import { createContext, useContext, useMemo, useState } from 'react';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';

export type SpreadsheetFullScreen = {
  on: boolean;
  enter: () => void;
  // Leaves it; false when it was not on, so the key goes on to whatever else wants it.
  exit: () => boolean;
};

const FullScreenContext = createContext<SpreadsheetFullScreen | null>(null);

export const SpreadsheetFullScreenProvider = FullScreenContext.Provider;

/** The surface's Full Screen, for the grid's keys and the formula bar's row; null outside a spreadsheet. */
export const useFullScreenContext = (): SpreadsheetFullScreen | null =>
  useContext(FullScreenContext);

export function useSpreadsheetFullScreen(): SpreadsheetFullScreen {
  const [on, setOn] = useState(false);
  return useMemo(() => {
    const turn = (next: boolean) => {
      setOn(next);
      track('UI', 'Toggled', 'SpreadsheetFullScreen');
      debugLog('[workbook] full screen', { on: next });
    };
    return {
      on,
      enter: () => {
        if (!on) turn(true);
      },
      exit: () => {
        if (!on) return false;
        turn(false);
        return true;
      },
    };
  }, [on]);
}
