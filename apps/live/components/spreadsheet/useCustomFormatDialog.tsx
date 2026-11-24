'use client';

// Opening Format › Number › Custom Number Format over the open sheet (docs/specs/029-sheets/formatting.md "Number
// formats"): the dialog reads the active cell as it opens, and Apply formats the selection with the code, one undo
// step; either way the keys go back to the grid.
import { useState, type ReactNode } from 'react';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';
import { CustomNumberFormatDialog } from './CustomNumberFormatDialog';

export function useCustomFormatDialog(actions: SheetActions): {
  open: () => void;
  dialog: ReactNode;
} {
  const c = useSheetController();
  const [shown, setShown] = useState(false);
  const close = () => {
    setShown(false);
    c.focusGrid();
  };
  const { active } = c.selection;
  const dialog = shown ? (
    <CustomNumberFormatDialog
      value={c.workbook.value(c.sheet.id, active.r, active.c)}
      format={actions.activeFormat()}
      locale={c.locale}
      onApply={(nc) => {
        actions.format({ nf: 'custom', nc, dp: null });
        debugLog('[workbook] custom number format', { applied: true });
        close();
      }}
      onClose={close}
    />
  ) : null;
  return { open: () => setShown(true), dialog };
}
