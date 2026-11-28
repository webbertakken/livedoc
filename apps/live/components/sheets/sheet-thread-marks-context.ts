'use client';

// A spreadsheet's open comment threads as the grid draws them (docs/specs/029-sheets/review.md "In the grid"): the open
// sheet's threads by their anchor's top-left cell (`cellKey`), for the markers, the hover card and what a screen reader
// hears, and the cell whose thread card is open, which hides its hover card. A Plan Sheet, a Viewer and a spreadsheet
// in This Browser give none.
import type { SheetThread } from '@livedoc/document';
import { createContext, useContext } from 'react';

export type SheetThreadMarks = {
  readonly byCell: ReadonlyMap<string, SheetThread>;
  /** The key of the cell whose thread card is open, else null. */
  readonly openCell: string | null;
};

export const SheetThreadMarksContext = createContext<SheetThreadMarks | null>(null);

export function useSheetThreadMarks(): SheetThreadMarks | null {
  return useContext(SheetThreadMarksContext);
}
