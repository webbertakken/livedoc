// A filter view's link (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers", D474): an address
// naming one of this sheet's saved views opens it, or says it was deleted; while a saved view is open the address
// names it, and closing it takes the name away. A temporary view changes no address.
import { useEffect, useRef } from 'react';
import { filterViewOf } from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import { filterViewAddress, filterViewOfSearch } from '@/lib/spreadsheet/filter-view-address';
import type { SheetController } from './sheet-controller';
import { FILTER_VIEW_DELETED } from './useFilterViews';

export function useFilterViewAddress(c: SheetController): void {
  const { sheet, filterViews, toast } = c;
  const sheetId = sheet.id;
  const landed = useRef(false);
  // On landing: the view the address names, when it is this sheet's.
  useEffect(() => {
    if (landed.current || typeof window === 'undefined') return;
    landed.current = true;
    const named = filterViewOfSearch(window.location.search);
    if (!named || named.sheetId !== sheetId) return;
    if (filterViewOf(sheet.layout, named.viewId)) {
      debugLog('[sheet] filter view link opened', { sheetId });
      filterViews.openSaved(named.viewId);
    } else {
      debugLog('[sheet] filter view link gone', { sheetId });
      window.history.replaceState({}, '', filterViewAddress(window.location.href, sheetId, null));
      toast(FILTER_VIEW_DELETED);
    }
  }, [sheetId, sheet.layout, filterViews, toast]);
  const savedId = filterViews.open && !filterViews.temporary ? filterViews.open.id : null;
  // Kept in step with the open saved view, once landed.
  useEffect(() => {
    if (!landed.current || typeof window === 'undefined') return;
    const named = filterViewOfSearch(window.location.search);
    const now = named?.sheetId === sheetId ? named.viewId : null;
    if (now === savedId || (!savedId && named && named.sheetId !== sheetId)) return;
    window.history.replaceState({}, '', filterViewAddress(window.location.href, sheetId, savedId));
  }, [savedId, sheetId]);
}
