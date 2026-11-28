'use client';

// Landing on a cell's link (docs/specs/029-sheets/inserted-objects.md "Get Link to This Cell", D641): an address whose
// query names a range opens with that range selected on the sheet the editor opened (its `#t=` tab), cut to the
// sheet's edge; the range leaves the address once used, so a refresh opens as the person left it.
import { useEffect, useRef } from 'react';
import type { GridRange } from '@livedoc/sheets';
import type { SheetController } from '@/components/sheets/sheet-controller';
import { debugLog } from '@/lib/debug-log';
import { rangeOfSearch, rangeOnSheet, withoutRange } from '@/lib/spreadsheet/sheet-links';

export function useCellLinkLanding(c: SheetController, goTo: (range: GridRange) => void): void {
  const landed = useRef(false);
  const { rows, cols } = c.sheet.layout;
  const sheetId = c.sheet.id;
  useEffect(() => {
    if (landed.current) return;
    landed.current = true;
    const range = rangeOfSearch(window.location.search);
    if (!range) return;
    window.history.replaceState({}, '', withoutRange(window.location.href));
    const on = rangeOnSheet(range, rows.length, cols.length);
    debugLog(`[sheets] cell link landed sheet=${sheetId} on=${on !== null}`);
    if (on) goTo(on);
  }, [rows.length, cols.length, sheetId, goTo]);
}
