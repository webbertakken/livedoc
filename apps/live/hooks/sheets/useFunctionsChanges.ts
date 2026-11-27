'use client';

// The named functions a person's layout change rewrites (docs/specs/029-sheets/formulas.md "Named functions", D301):
// a deletion's shrink, its undo and its redo, saved as the panel saves the list, then applied. Each change is worked
// out against the list as it stands when its turn comes, one after another, so an undo lands after its deletion's
// shrink and someone's edit made meanwhile is seen.
import { useCallback, useEffect, useRef } from 'react';
import type { NamedFunction, WorkbookRecord } from '@livedoc/sheets';
import { apiSaveWorkbookFunctions, type WorkbookScope } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import type { FunctionsChange } from '@/components/sheets/functions-shrink';

const NONE: readonly NamedFunction[] = [];

export function useFunctionsChanges(
  scope: WorkbookScope,
  functions: readonly NamedFunction[] | undefined,
  onWorkbook: (workbook: WorkbookRecord) => void,
): (change: FunctionsChange) => void {
  // The list as last seen: the record's, or the last save's answer until the record catches up.
  const current = useRef(functions ?? NONE);
  useEffect(() => {
    current.current = functions ?? NONE;
  }, [functions]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const { ownerId, documentId, shareCode } = scope;
  return useCallback(
    (change: FunctionsChange) => {
      queue.current = queue.current.then(async () => {
        const next = change(current.current);
        if (!next) return debugLog('[workbook] named functions unchanged by the layout', {});
        try {
          const { workbook } = await apiSaveWorkbookFunctions(
            { ownerId, documentId, shareCode },
            next,
          );
          current.current = workbook.functions ?? NONE;
          debugLog('[workbook] named functions follow the layout', { count: next.length });
          onWorkbook(workbook);
        } catch (error) {
          debugLog('[workbook] named functions not saved for the layout', { error: String(error) });
        }
      });
    },
    [ownerId, documentId, shareCode, onWorkbook],
  );
}
