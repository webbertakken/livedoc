'use client';

// A spreadsheet's conversion, as a person's choice (docs/specs/029-sheets/files-and-print.md "Converting",
// "Download"): the dialog opens checking what the other format cannot hold, lists it, and only then converts (one undo
// step) or downloads a converted copy. A slow answer to a dialog already closed or opened again is dropped.
import { useRef, useState } from 'react';
import type { WorkbookFormat, WorkbookRecord } from '@livedoc/sheets';
import type { ConversionLoss } from '@livedoc/sheets/files';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { apiConvertWorkbook, apiWorkbookConversion, type WorkbookScope } from '@/lib/api/workbook';
import { debugLog } from '@/lib/debug-log';
import type { ConversionPurpose } from '@/lib/spreadsheet/conversion-copy';
import { track } from '@/lib/telemetry';

export const CONVERT_FAILED = 'The spreadsheet could not be converted. Try again.';

const TELEMETRY_FORMAT = { ods: 'Ods', fods: 'Ods', xlsx: 'Xlsx' } as const;

export type ConversionState =
  | { k: 'closed' }
  | { k: 'checking'; purpose: ConversionPurpose; to: WorkbookFormat }
  | { k: 'failed'; purpose: ConversionPurpose; to: WorkbookFormat }
  | {
      k: 'listed' | 'running';
      purpose: ConversionPurpose;
      to: WorkbookFormat;
      losses: ConversionLoss[];
    };

export type WorkbookConversionDeps = {
  scope: WorkbookScope;
  format: WorkbookFormat;
  // The record a conversion answered, applied without waiting for the room.
  onWorkbook: ((workbook: WorkbookRecord) => void) | undefined;
  pushUndo: (step: ItemUndoStep) => void;
  download: (format: WorkbookFormat) => Promise<void>;
  setProblem: (problem: string | null) => void;
};

export function useWorkbookConversion(deps: WorkbookConversionDeps) {
  const [state, setState] = useState<ConversionState>({ k: 'closed' });
  // Each opening's number: an answer for an earlier one is dropped.
  const opening = useRef(0);

  const check = (purpose: ConversionPurpose, to: WorkbookFormat) => {
    const at = ++opening.current;
    setState({ k: 'checking', purpose, to });
    apiWorkbookConversion(deps.scope, to).then(
      ({ losses }) => {
        if (opening.current === at) setState({ k: 'listed', purpose, to, losses });
      },
      (error: unknown) => {
        debugLog('[workbook] conversion check failed', { to, error: String(error) });
        if (opening.current === at) setState({ k: 'failed', purpose, to });
      },
    );
  };

  // The format changed to `to`; false when the api refused it or could not be reached (the problem shown).
  const flip = async (to: WorkbookFormat): Promise<boolean> => {
    try {
      const { workbook } = await apiConvertWorkbook(deps.scope, to);
      deps.onWorkbook?.(workbook);
      return true;
    } catch (error) {
      debugLog('[workbook] convert failed', { to, error: String(error) });
      deps.setProblem(CONVERT_FAILED);
      return false;
    }
  };

  const convert = async (to: WorkbookFormat) => {
    const from = deps.format;
    const done = await flip(to);
    opening.current++;
    setState({ k: 'closed' });
    if (!done) return;
    track('Spreadsheet', 'Converted', TELEMETRY_FORMAT[to]);
    // Undo converts back, and redo again, without the dialog: nothing in LiveDoc changed.
    deps.pushUndo({ undo: () => void flip(from), redo: () => void flip(to) });
  };

  const confirm = () => {
    if (state.k !== 'listed') return;
    deps.setProblem(null);
    setState({ ...state, k: 'running' });
    if (state.purpose === 'convert') return void convert(state.to);
    void deps.download(state.to).finally(() => {
      opening.current++;
      setState({ k: 'closed' });
    });
  };

  return {
    state,
    open: check,
    retry: () => {
      if (state.k === 'failed') check(state.purpose, state.to);
    },
    cancel: () => {
      opening.current++;
      setState({ k: 'closed' });
    },
    confirm,
  };
}
