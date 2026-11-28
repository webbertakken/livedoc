'use client';

// Opening a cell's link within the workbook (docs/specs/029-sheets/inserted-objects.md "The link card"): a spreadsheet
// opens the sheet's tab with the range selected; a Plan Sheet has no sheet to go to, so it gives none and such a link
// opens nothing there. A web address opens as a HYPERLINK's does, wherever the grid is.
import { createContext, useContext } from 'react';
import type { CellLinkTarget } from '@livedoc/sheets';
import { openHyperlink } from '@/lib/open-hyperlink';

export type FollowSheetLink = (target: Extract<CellLinkTarget, { k: 'sheet' }>) => void;

export const SheetLinkFollowContext = createContext<FollowSheetLink | null>(null);

/** Opens a cell's link: a web address in a new tab, a sheet of the workbook through `toSheet` when there is one. */
export function followCellLink(target: CellLinkTarget, toSheet: FollowSheetLink | null): boolean {
  if (target.k === 'web') {
    openHyperlink(target.href);
    return true;
  }
  if (!toSheet) return false;
  toSheet(target);
  return true;
}

export function useSheetLinkFollow(): FollowSheetLink | null {
  return useContext(SheetLinkFollowContext);
}
