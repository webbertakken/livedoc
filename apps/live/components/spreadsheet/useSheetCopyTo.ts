'use client';

// Copy To on the open spreadsheet (docs/specs/029-sheets/spreadsheet.md "Sheets in the sheet bar", D183-D186): a sheet
// copied into a new spreadsheet or one picked, everyone's who may read it. The sheet is copied as this page holds it,
// so a sheet still paging its rows in waits; once copied, a dialog offers to open where it went.
import { useState } from 'react';
import type { WorkbookRecord } from '@livedoc/sheets';
import { sheetStoreOf } from '@/components/sheets/sheet-store-client';
import { sheetRefusalMessage } from '@/components/sheets/sheet-refusals';
import type { SheetsBridge } from '@/hooks/sheets/useSheetsBridge';
import { useConfirm } from '@/hooks/ui/useConfirm';
import { useLatest } from '@/hooks/ui/useLatest';
import { debugLog } from '@/lib/debug-log';
import { copySheetTo, type CopyToTarget } from '@/lib/spreadsheet/copy-sheet-to';

export type SheetCopyTo = {
  // Whose spreadsheets the picker lists, and the one they are on (never listed).
  ownerId: string;
  documentId: string;
  // The tab whose copy waits for a spreadsheet to be picked (Existing Spreadsheet).
  picking: string | null;
  pick: (tabId: string | null) => void;
  copy: (tabId: string, target: CopyToTarget) => void;
};

export function useSheetCopyTo(
  bridge: SheetsBridge | null,
  record: WorkbookRecord,
): SheetCopyTo | null {
  const confirm = useConfirm();
  const [picking, setPicking] = useState<string | null>(null);
  const latest = useLatest({ bridge, record, confirm });
  const copy = (tabId: string, target: CopyToTarget) => {
    // Only reachable through the bar, which has Copy To only with the bridge.
    const { bridge: held, record: r, confirm: ask } = latest.current;
    const b = held!;
    const store = sheetStoreOf(b);
    const sheet = store.sheetsOn(tabId)[0];
    if (!sheet || store.loading(sheet.id)) {
      b.toast(sheetRefusalMessage('sheet_loading'));
      return;
    }
    debugLog('[workbook] copy to', { target: target.kind });
    b.notify(`Copying ${sheet.title}…`);
    const ctx = store.workbook(tabId).ctxFor(sheet.id);
    void copySheetTo(b.scope.ownerId, { sheet, ctx, record: r }, target, () => {}).then(
      async (copied) => {
        if (!copied.ok) {
          b.toast(copied.message);
          return;
        }
        const open = await ask({
          title: 'Sheet copied',
          message: `“Copy of ${sheet.title}” is in “${copied.name}”.`,
          confirmLabel: 'Open Spreadsheet',
          cancelLabel: 'OK',
        });
        if (open)
          window.open(`/document/${encodeURIComponent(copied.documentId)}`, '_blank', 'noopener');
      },
    );
  };
  if (!bridge) return null;
  return {
    ownerId: bridge.scope.ownerId,
    documentId: bridge.scope.documentId,
    picking,
    pick: setPicking,
    copy,
  };
}
