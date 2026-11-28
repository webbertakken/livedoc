'use client';

// Ctrl+Alt+R, Google's "Open drop-down menu on filtered cell" (docs/specs/029-sheets/data-tools.md "Filters, filter
// views and slicers", D504): the filter menu of the active cell's column when the cell lies in a filter's range, its
// header row included: the open view's, else a table's own while on, else the sheet's. It opens under the column's
// filter button, or under the active cell when that button is not drawn; elsewhere it does nothing.
import { createContext, useContext, useEffect, type RefObject } from 'react';
import { filterAtCell, type CellPos } from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';
import { useSheetController, type SheetController } from './sheet-controller';
import { rectOf } from './SheetSelectionLayer';

/** The shortcut's binding runs `current`, which the grid's tables layer sets while it is drawn. */
export type FilterMenuOpener = { current: (() => void) | null };
export const FilterMenuContext = createContext<FilterMenuOpener | null>(null);

type MenuPoint = { x: number; y: number };

const below = (el: Element): MenuPoint => {
  const box = el.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
};

// Under the active cell, in the page, from the layer drawn over the cells.
function underCell(c: SheetController, layer: HTMLElement, at: CellPos): MenuPoint {
  const origin = layer.getBoundingClientRect();
  const r = rectOf(c.geometry, { r1: at.r, c1: at.c, r2: at.r, c2: at.c }, c.scroll);
  return { x: origin.left + r.x, y: origin.top + r.y + r.h };
}

/**
 * Sets the shortcut's opener: a table's filter menu through `openTableFilter` (the tables layer draws it), the sheet's
 * or the open view's through the controller's filter menu. `layer` is the tables layer's root, over the cells.
 */
export function useFilterMenuShortcut(
  layer: RefObject<HTMLElement | null>,
  openTableFilter: (at: MenuPoint & { tableId: string; colId: string }) => void,
): void {
  const c = useSheetController();
  const openerRef = useContext(FilterMenuContext);
  useEffect(() => {
    if (!openerRef) return;
    openerRef.current = () => {
      const { active } = c.selectionNow();
      const view = c.filterViews.open ? c.filterViews.drawn : null;
      const target = filterAtCell(c.sheet.layout, active, view);
      const root = layer.current;
      if (!target || !root) {
        debugLog('[sheet] filter menu by key: no filter over the cell', {
          r: active.r,
          c: active.c,
        });
        return;
      }
      debugLog('[sheet] filter menu by key', { kind: target.kind });
      if (target.kind === 'table') {
        const button = root.querySelector(
          `[data-table-column="${target.tableId}:${target.colId}"]`,
        );
        const at = button ? below(button) : underCell(c, root, active);
        openTableFilter({ tableId: target.tableId, colId: target.colId, ...at });
        return;
      }
      const button = c.gridEl?.querySelector(`[data-filter-column="${target.colId}"]`);
      const at = button ? below(button) : underCell(c, root, active);
      c.setMenu({ kind: 'filter', colId: target.colId, ...at });
    };
    return () => {
      openerRef.current = null;
    };
  });
}
