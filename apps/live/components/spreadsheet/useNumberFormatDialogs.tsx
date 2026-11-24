'use client';

// Format › Number's dialogs over the open sheet (docs/specs/029-sheets/formatting.md "Number formats"): Custom Number
// Format and Custom Currency. Each reads the active cell as it opens; Apply formats the selection with its code as
// Custom, one undo step; either way the keys go back to the grid.
import { useState, type ReactNode } from 'react';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';
import { CustomCurrencyDialog } from './CustomCurrencyDialog';
import { CustomNumberFormatDialog } from './CustomNumberFormatDialog';

type Shown = 'customFormat' | 'customCurrency' | null;

export function useNumberFormatDialogs(actions: SheetActions): {
  openCustomFormat: () => void;
  openCustomCurrency: () => void;
  dialog: ReactNode;
} {
  const c = useSheetController();
  const [shown, setShown] = useState<Shown>(null);
  const close = () => {
    setShown(null);
    c.focusGrid();
  };
  const apply = (nc: string) => {
    actions.format({ nf: 'custom', nc, dp: null });
    debugLog('[workbook] number format dialog applied', { dialog: shown });
    close();
  };
  const { active } = c.selection;
  const dialog =
    shown === 'customFormat' ? (
      <CustomNumberFormatDialog
        value={c.workbook.value(c.sheet.id, active.r, active.c)}
        format={actions.activeFormat()}
        locale={c.locale}
        onApply={apply}
        onClose={close}
      />
    ) : shown === 'customCurrency' ? (
      <CustomCurrencyDialog locale={c.locale} onApply={apply} onClose={close} />
    ) : null;
  return {
    openCustomFormat: () => setShown('customFormat'),
    openCustomCurrency: () => setShown('customCurrency'),
    dialog,
  };
}
