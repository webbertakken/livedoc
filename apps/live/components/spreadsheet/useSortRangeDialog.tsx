'use client';

// Data › Sort Range › Advanced Range Sorting Options over the open sheet (docs/specs/029-sheets/data-tools.md "Sort"):
// it reads the selection and the active column as it opens; Sort runs the engine's range sort, one undo step; either
// way the keys go back to the grid.
import { useState, type ReactNode } from 'react';
import type { GridRange, SortKey } from '@livedoc/sheets';
import { useSheetController } from '@/components/sheets/sheet-controller';
import { cellSpokenValue } from '@/components/sheets/sheet-cell-speech';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';
import { sortRangeStart } from '@/lib/spreadsheet/sort-range';
import { SortRangeDialog } from './SortRangeDialog';

export function useSortRangeDialog(actions: SheetActions): {
  openSortRange: () => void;
  dialog: ReactNode;
} {
  const c = useSheetController();
  const [open, setOpen] = useState<{ range: GridRange; start: SortKey[] } | null>(null);
  const close = () => {
    setOpen(null);
    c.focusGrid();
  };
  const openSortRange = () => {
    const { ranges, active } = c.selectionNow();
    const range = ranges[ranges.length - 1]!;
    setOpen({ range, start: sortRangeStart(range, active) });
  };
  const dialog = open ? (
    <SortRangeDialog
      range={open.range}
      start={open.start}
      headerText={(col) => cellSpokenValue(c.sheet, c.workbook, c.locale, open.range.r1, col)}
      onSort={(keys, header) => {
        actions.sortRange(keys, header);
        debugLog('[workbook] range sorted', { keys: keys.length, header });
        close();
      }}
      onClose={close}
    />
  ) : null;
  return { openSortRange, dialog };
}
