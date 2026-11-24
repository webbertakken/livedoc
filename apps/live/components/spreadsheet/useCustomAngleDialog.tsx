'use client';

// Format › Rotation › Custom Angle over the open sheet (docs/specs/029-sheets/formatting.md "Alignment, wrapping,
// rotation", D211): it reads the active cell as it opens; Apply turns the selection, one undo step; either way the
// keys go back to the grid.
import { useState, type ReactNode } from 'react';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';
import { CustomAngleDialog } from './CustomAngleDialog';

export function useCustomAngleDialog(actions: SheetActions): {
  openCustomAngle: () => void;
  dialog: ReactNode;
} {
  const c = useSheetController();
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    c.focusGrid();
  };
  const dialog = open ? (
    <CustomAngleDialog
      format={actions.activeFormat()}
      onApply={(ro) => {
        actions.format({ ro });
        debugLog('[workbook] custom angle applied', { ro });
        close();
      }}
      onClose={close}
    />
  ) : null;
  return { openCustomAngle: () => setOpen(true), dialog };
}
