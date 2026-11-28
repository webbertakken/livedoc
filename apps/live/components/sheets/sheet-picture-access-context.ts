'use client';

// Who asks the image store for a spreadsheet's pictures' bytes (docs/specs/029-sheets/inserted-objects.md "Images in a
// cell"): the grid draws a cell's gallery picture with it. A spreadsheet provides it; a Plan Sheet has none, and its
// cells hold no pictures.
import { createContext, useContext } from 'react';
import type { SheetImageAccess } from './sheet-images-over-cells-context';

export const SheetPictureAccessContext = createContext<SheetImageAccess | null>(null);

export function useSheetPictureAccess(): SheetImageAccess | null {
  return useContext(SheetPictureAccessContext);
}
