'use client';

// A spreadsheet's slicers (docs/specs/029-sheets/data-tools.md "Slicers", D476): Data › Add a Slicer over the
// filter's range (a table's rows when the selection is inside one), else the filled range around the selection, at
// the top right of the cells in view, selected, with the Slicer panel open on it; and an Editor's writes to one, each
// one undo step.
import { useCallback, useMemo, useState } from 'react';
import {
  makeAxisIds,
  NEW_SLICER_SIZE,
  sheetSlicers,
  slicerOverTable,
  slicerPlacement,
  SLICERS_MAX,
  type SheetSlicer,
} from '@livedoc/sheets';
import type { SheetController } from '@/components/sheets/sheet-controller';
import {
  markPlacedSlicer,
  type SheetSlicerWrites,
} from '@/components/sheets/slicers/slicers-context';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { anchorAt } from '../charts/sheet-chart-place';

// How far from the cells' top and right edges a new slicer sits (px at 100%).
const NEW_SLICER_MARGIN_PX = 16;

export const SLICERS_FULL = `This sheet already has ${SLICERS_MAX} slicers`;
export const NOTHING_TO_SLICE = 'Select the cells to filter first';

export function useSpreadsheetSlicers(
  c: SheetController,
  // Opens the Slicer panel (an Editor's).
  reveal: () => void,
  // The width the Slicer panel will take from the cells in view as it opens (0 while it is open already).
  panelRoom: () => number = () => 0,
): {
  writes: SheetSlicerWrites | null;
  addSlicer: () => void;
  // The slicer the Slicer panel is open on.
  editing: string | null;
} {
  const { sheet, geometry, canShape, write } = c;
  const [editing, setEditing] = useState<string | null>(null);
  const put = useCallback(
    (id: string, object: SheetSlicer | null, what: string) => {
      const ok = write({ kind: 'layout', changes: [{ k: 'object', id, object }] }, 'Slicer');
      debugLog(`[sheet] slicer ${what} sheet=${sheet.id} slicer=${id} ok=${ok}`);
      return ok;
    },
    [write, sheet.id],
  );
  const edit = useCallback(
    (id: string) => {
      setEditing(id);
      reveal();
    },
    [reveal],
  );
  const writes = useMemo<SheetSlicerWrites | null>(
    () =>
      canShape
        ? {
            change: (next, what) => put(next.id, next, what),
            remove: (id) => void put(id, null, 'removed'),
            edit,
          }
        : null,
    [canShape, put, edit],
  );

  const addSlicer = useCallback(() => {
    if (!canShape) return;
    const layout = sheet.layout;
    const taken = sheetSlicers(layout);
    if (taken.length >= SLICERS_MAX) {
      debugLog('[sheet] slicer refused', { reason: 'full' });
      c.toast(SLICERS_FULL);
      return;
    }
    const sel = c.selectionNow();
    const at = slicerPlacement(layout, sel.ranges[sel.ranges.length - 1]!, c.grid);
    if (!at) {
      debugLog('[sheet] slicer refused', { reason: 'range' });
      c.announce(NOTHING_TO_SLICE);
      return;
    }
    // The top right of the cells in view once the Slicer panel is open beside them.
    const right =
      c.view.width - geometry.headW - panelRoom() - NEW_SLICER_SIZE.width - NEW_SLICER_MARGIN_PX;
    const anchor = anchorAt(
      {
        x: c.scroll.left + Math.max(0, right),
        y: c.scroll.top + NEW_SLICER_MARGIN_PX,
      },
      layout,
      geometry,
    );
    const [id] = makeAxisIds(1, Math.random, new Set((layout.objects ?? []).map((x) => x.id)));
    const slicer: SheetSlicer = {
      id: id!,
      kind: 'slicer',
      at: anchor,
      ...NEW_SLICER_SIZE,
      range: at.range,
      col: at.col,
    };
    markPlacedSlicer(id!);
    if (!put(id!, slicer, 'added')) return;
    debugLog('[sheet] slicer added', { id, table: !!slicerOverTable(layout, slicer) });
    track('Spreadsheet', 'Changed', 'Slicer');
    edit(id!);
  }, [c, canShape, sheet.layout, geometry, put, edit, panelRoom]);

  return { writes, addSlicer, editing };
}
