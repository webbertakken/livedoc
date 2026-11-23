'use client';

// View › Show › Formulas (docs/specs/029-sheets/grid-and-editing.md "Formulas", D141): the person's own view, held by
// the spreadsheet's surface and read by its grid; off wherever no surface sets it (a Plan Sheet).
import { createContext, useCallback, useState } from 'react';
import { debugLog } from '@/lib/debug-log';

export const ShowFormulasContext = createContext(false);

export type ShowFormulas = { shown: boolean; toggle: () => void };

/** The surface's flag, kept across its sheets while the page is open, never saved. */
export function useShowFormulas(): ShowFormulas {
  const [shown, setShown] = useState(false);
  const toggle = useCallback(() => {
    debugLog('[workbook] show formulas', { on: !shown });
    setShown(!shown);
  }, [shown]);
  return { shown, toggle };
}
