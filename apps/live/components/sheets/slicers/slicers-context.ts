'use client';

// What the grid's slicers layer needs from the spreadsheet around it (docs/specs/029-sheets/data-tools.md "Slicers"):
// an Editor's writes to a slicer, each one undo step, and the Slicer panel. Absent (a Plan tab's Sheet, a test), the
// slicers still draw and filter for their viewer, and nobody moves or edits them there.
import { createContext, useContext } from 'react';
import type { SheetSlicer } from '@livedoc/sheets';

export type SheetSlicerWrites = {
  // A slicer set whole (moved, resized, its default set), one undo step; false when refused.
  change: (next: SheetSlicer, what: string) => boolean;
  remove: (id: string) => void;
  // Opens the Slicer panel on it.
  edit: (id: string) => void;
};

export const SheetSlicersContext = createContext<SheetSlicerWrites | null>(null);

export function useSheetSlicerWrites(): SheetSlicerWrites | null {
  return useContext(SheetSlicersContext);
}

// A slicer this person just added: selected as it draws, ready to move (SheetSlicersLayer).
const placed = new Set<string>();
export const markPlacedSlicer = (id: string): void => void placed.add(id);
export const takePlacedSlicer = (id: string): boolean => placed.delete(id);
