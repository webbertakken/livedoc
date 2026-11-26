'use client';

// Going to a range on another sheet of the workbook (docs/specs/029-sheets/data-tools.md "Named ranges and named
// functions", surface.md "Formula bar"): the spreadsheet's surface opens that sheet with the range selected. A Plan
// Sheet has none to give, so its names lists keep to its own sheet.
import { createContext, useContext } from 'react';
import type { GridRange } from '@livedoc/sheets';

export type OpenSheetAt = (sheetId: string, range: GridRange) => void;

export const SheetNavigationContext = createContext<OpenSheetAt | null>(null);

export function useSheetNavigation(): OpenSheetAt | null {
  return useContext(SheetNavigationContext);
}
