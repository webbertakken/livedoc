// A cell's box on the screen (the link editor and card, the note box): the grid's at its zoom, the cell's within it,
// a merged cell's whole area.
import type { SheetController } from '@/components/sheets/sheet-controller';
import { cellBox, mergeAt } from '@/components/sheets/sheet-geometry';
import type { Box } from '@/lib/office/popup-place';

export type ScreenCellBox = Box & { right: number };

export function cellScreenBox(c: SheetController, r: number, col: number): ScreenCellBox {
  const grid = c.gridEl;
  // A grid not laid out yet (as in a test) anchors at the corner.
  if (!grid) return { left: 0, top: 0, bottom: 0, right: 0 };
  const rect = grid.getBoundingClientRect();
  const scale = grid.offsetWidth > 0 ? rect.width / grid.offsetWidth : 1;
  const box = cellBox(c.geometry, r, col, c.scroll, mergeAt(c.geometry, r, col));
  const left = rect.left + (c.geometry.headW + box.x) * scale;
  const top = rect.top + (c.geometry.headH + box.y) * scale;
  return { left, top, bottom: top + box.h * scale, right: left + box.w * scale };
}

export function activeCellBox(c: SheetController): ScreenCellBox {
  return cellScreenBox(c, c.selection.active.r, c.selection.active.c);
}
