'use client';

// The cell whose note box is open (docs/specs/029-sheets/review.md "Notes"): the box replaces that cell's hover card.
// A Plan Sheet opens no note box, so it gives none.
import { createContext, useContext } from 'react';

export type OpenNoteCell = { sheetId: string; r: number; c: number };

export const SheetNoteOpenContext = createContext<OpenNoteCell | null>(null);

export function useOpenNoteCell(): OpenNoteCell | null {
  return useContext(SheetNoteOpenContext);
}
