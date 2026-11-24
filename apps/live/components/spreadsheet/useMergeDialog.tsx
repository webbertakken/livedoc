'use client';

// The merge that asks first (docs/specs/029-sheets/formatting.md "Merges", D208): a merge that would clear values opens
// the shell's Merge Cells dialog, OK merging, keeping each part's top-left value, one undo step; Cancel, Escape and ×
// change nothing. One with nothing to clear merges at once. Either way the keys go back to the grid.
import { useState, type ReactNode } from 'react';
import type { MergeMode } from '@livedoc/sheets';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';

export function useMergeDialog(actions: SheetActions): {
  merge: (mode: MergeMode) => void;
  dialog: ReactNode;
} {
  const c = useSheetController();
  const [asking, setAsking] = useState<MergeMode | null>(null);
  const close = () => {
    setAsking(null);
    c.focusGrid();
  };
  const merge = (mode: MergeMode) =>
    actions.merge(mode, () => {
      debugLog('[workbook] merge asks first', { mode });
      setAsking(mode);
      return false;
    });
  const dialog =
    asking === null ? null : (
      <OfficeDialog
        open
        onClose={close}
        title="Merge Cells"
        primary={{
          label: 'OK',
          onPress: () => {
            actions.merge(asking, () => true);
            debugLog('[workbook] merge confirmed', { mode: asking });
            close();
          },
        }}
      >
        <p>Merging cells will only preserve the top-leftmost value.</p>
      </OfficeDialog>
    );
  return { merge, dialog };
}
