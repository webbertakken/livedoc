'use client';

// What the grid needs to draw a spreadsheet's images over cells (docs/specs/029-sheets/inserted-objects.md "Images over
// cells"): the open sheet's images at their px places, who asks for their bytes, and their changes, each one undo
// step. A spreadsheet provides it (useSpreadsheetImages); a Plan Sheet has none.
import { createContext, useContext } from 'react';
import type { SheetImage } from '@livedoc/sheets';
import type { ImageBox } from '@/lib/spreadsheet/sheet-image-place';

/** An image with its top-left in sheet px from A1's corner. */
export type PlacedSheetImage = { image: SheetImage; x: number; y: number };

/** Who asks the image store for a picture's bytes (images.md "Placement grants"). */
export type SheetImageAccess = { ownerId: string; documentId: string; shareCode: string | null };

export type SheetImagesOverCells = {
  images: readonly PlacedSheetImage[];
  access: SheetImageAccess;
  // An Editor's: selected, moved, resized and given its menu.
  editable: boolean;
  // A move or a resize to a box in sheet px, one undo step.
  place: (id: string, box: ImageBox, what: 'moved' | 'resized') => void;
  remove: (id: string) => void;
  // Its menu (Alt Text, Replace Image, Delete) at a rect.
  menu: (id: string, at: DOMRect) => void;
  // The image whose menu is open: drawn selected while it is.
  menuFor: string | null;
};

export const SheetImagesOverCellsContext = createContext<SheetImagesOverCells | null>(null);

export function useSheetImagesOverCells(): SheetImagesOverCells | null {
  return useContext(SheetImagesOverCellsContext);
}

// The image this person placed last, for the grid to select once it draws it (SheetImagesLayer).
let placedImageId: string | null = null;
export function markPlacedImage(id: string): void {
  placedImageId = id;
}
export function takePlacedImage(id: string): boolean {
  if (placedImageId !== id) return false;
  placedImageId = null;
  return true;
}
