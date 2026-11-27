'use client';

// View › Show › Protected Ranges (docs/specs/029-sheets/data-tools.md "Protected ranges"): the person's own view, on
// by default, held by the spreadsheet's surface while the page is open and read by its grid; never saved.
import { createContext, useCallback, useState } from 'react';
import { debugLog } from '@/lib/debug-log';

export const ShowProtectedContext = createContext(true);

export type ShowProtected = { shown: boolean; toggle: () => void };

export function useShowProtected(): ShowProtected {
  const [shown, setShown] = useState(true);
  const toggle = useCallback(() => {
    debugLog('[workbook] show protected ranges', { on: !shown });
    setShown(!shown);
  }, [shown]);
  return { shown, toggle };
}
