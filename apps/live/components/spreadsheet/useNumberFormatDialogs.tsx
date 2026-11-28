'use client';

// Format › Number's dialogs over the open sheet (docs/specs/029-sheets/formatting.md "Number formats"): Custom Number
// Format, Custom Currency and Custom Date and Time. Each reads the active cell as it opens; Apply formats the selection with its code as
// Custom, one undo step; either way the keys go back to the grid.
import { readWorkbook } from '@/components/sheets/read-workbook';
import { useState, type ReactNode } from 'react';
import { useSheetController } from '@/components/sheets/sheet-controller';
import type { SheetActions } from '@/components/sheets/useSheetActions';
import { debugLog } from '@/lib/debug-log';
import { CustomCurrencyDialog } from './CustomCurrencyDialog';
import { CustomDateTimeDialog } from './CustomDateTimeDialog';
import { CustomNumberFormatDialog } from './CustomNumberFormatDialog';

type Shown = 'customFormat' | 'customCurrency' | 'customDateTime' | null;

export function useNumberFormatDialogs(actions: SheetActions): {
  openCustomFormat: () => void;
  openCustomCurrency: () => void;
  openCustomDateTime: () => void;
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
  const value = readWorkbook(c.version, () => c.workbook.value(c.sheet.id, active.r, active.c));
  const dialog =
    shown === 'customFormat' ? (
      <CustomNumberFormatDialog
        value={value}
        format={actions.activeFormat()}
        locale={c.locale}
        onApply={apply}
        onClose={close}
      />
    ) : shown === 'customCurrency' ? (
      <CustomCurrencyDialog locale={c.locale} onApply={apply} onClose={close} />
    ) : shown === 'customDateTime' ? (
      <CustomDateTimeDialog
        value={value}
        format={actions.activeFormat()}
        locale={c.locale}
        onApply={apply}
        onClose={close}
      />
    ) : null;
  return {
    openCustomFormat: () => setShown('customFormat'),
    openCustomCurrency: () => setShown('customCurrency'),
    openCustomDateTime: () => setShown('customDateTime'),
    dialog,
  };
}
