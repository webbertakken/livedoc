'use client';

// A This Browser spreadsheet's named functions shrunk in the browser (docs/specs/029-sheets/formulas.md "Named
// functions", D301): rows or columns deleted inside a range a definition reads shrink it there, as the api shrinks a
// stored spreadsheet's when the deletion reaches it. The list is saved as the panel saves it, then applied.
import { useCallback } from 'react';
import type { NamedFunction, WorkbookRecord } from '@livedoc/sheets';
import { apiSaveWorkbookFunctions, type WorkbookScope } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';

/** What the sheet store calls with the shrunk list: undefined for a stored spreadsheet, whose api shrinks it. */
export function useOfflineFunctionsShrink(
  scope: WorkbookScope,
  offline: boolean,
  onWorkbook: (workbook: WorkbookRecord) => void,
): ((functions: readonly NamedFunction[]) => void) | undefined {
  const { ownerId, documentId, shareCode } = scope;
  const shrink = useCallback(
    (functions: readonly NamedFunction[]) => {
      apiSaveWorkbookFunctions({ ownerId, documentId, shareCode }, functions).then(
        ({ workbook }) => {
          debugLog('[workbook] offline named functions shrunk', { count: functions.length });
          onWorkbook(workbook);
        },
        (error: unknown) =>
          debugLog('[workbook] offline named functions not shrunk', { error: String(error) }),
      );
    },
    [ownerId, documentId, shareCode, onWorkbook],
  );
  return offline ? shrink : undefined;
}
