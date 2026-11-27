'use client';

// A spreadsheet's named functions in the surface (docs/specs/029-sheets/data-tools.md "Named ranges and named
// functions"): the workbook record's list, and an Editor's save of a new list, whole (D303), applied without waiting
// for the room. Each save is one undo step on the person's timeline: undo saves the list before, redo the list after.
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { NamedFunction, WorkbookRecord } from '@livedoc/sheets';
import { apiSaveWorkbookFunctions, type WorkbookScope } from '@/lib/api/workbook';
import { ApiError } from '@/lib/api/core';
import { debugLog } from '@/lib/debug-log';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';

export const FUNCTIONS_NOT_SAVED = 'The named functions could not be saved. Try again.';
export const FUNCTIONS_REFUSED = 'LiveDoc refused those named functions.';
export const FUNCTIONS_FULL = 'A spreadsheet holds up to 100 named functions.';

export type NamedFunctionsState = {
  functions: readonly NamedFunction[];
  // Saves the list whole as one undo step; false when the api refused it or could not be reached (toasted).
  save: (next: readonly NamedFunction[]) => Promise<boolean>;
};

const NONE: readonly NamedFunction[] = [];

const NamedFunctionsContext = createContext<NamedFunctionsState>({
  functions: NONE,
  save: () => Promise.resolve(false),
});

export const NamedFunctionsProvider = NamedFunctionsContext.Provider;

export const useNamedFunctions = (): NamedFunctionsState => useContext(NamedFunctionsContext);

function refusal(error: unknown): string {
  if (!(error instanceof ApiError)) return FUNCTIONS_NOT_SAVED;
  if (error.code === 'functions_full') return FUNCTIONS_FULL;
  return error.code === 'functions_invalid' ? FUNCTIONS_REFUSED : FUNCTIONS_NOT_SAVED;
}

/** The surface's named functions, from its workbook record. */
export function useNamedFunctionsState(
  scope: WorkbookScope,
  record: WorkbookRecord,
  onWorkbook: ((workbook: WorkbookRecord) => void) | undefined,
  // The person's timeline and toasts (the sheets bridge); none while it loads.
  host: { pushUndo: (step: ItemUndoStep) => void; toast: (message: string) => void } | null,
): NamedFunctionsState {
  const functions = record.functions ?? NONE;
  const put = useCallback(
    async (next: readonly NamedFunction[]): Promise<boolean> => {
      try {
        const { workbook } = await apiSaveWorkbookFunctions(scope, next);
        onWorkbook?.(workbook);
        debugLog('[workbook] named functions saved', { count: next.length });
        return true;
      } catch (error) {
        debugLog('[workbook] named functions not saved', {
          count: next.length,
          error: String(error),
        });
        host?.toast(refusal(error));
        return false;
      }
    },
    [scope, onWorkbook, host],
  );
  const save = useCallback(
    async (next: readonly NamedFunction[]) => {
      const before = functions;
      if (!(await put(next))) return false;
      host?.pushUndo({ undo: () => void put(before), redo: () => void put(next) });
      return true;
    },
    [functions, put, host],
  );
  return useMemo(() => ({ functions, save }), [functions, save]);
}
