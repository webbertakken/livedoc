'use client';

// A spreadsheet's conversion dialog (docs/specs/029-sheets/files-and-print.md "Converting", D88): its state worded in
// the spreadsheet's copy, drawn by the office shell's dialog.
import {
  CONVERSION_CHECK_FAILED,
  conversionChecking,
  conversionLead,
  conversionLine,
  conversionTitle,
} from '@livedoc/sheets/files';
import {
  OfficeConversionDialog,
  type OfficeConversionView,
} from '@/components/office/OfficeConversionDialog';
import type { ConversionState } from './useWorkbookConversion';

function viewOf(state: ConversionState): OfficeConversionView | null {
  if (state.k === 'closed') return null;
  const { purpose, to } = state;
  const title = conversionTitle(purpose, to);
  const action = purpose === 'convert' ? 'Convert' : 'Download';
  if (state.k === 'checking')
    return { phase: 'checking', title, action, message: conversionChecking(to) };
  if (state.k === 'failed')
    return { phase: 'failed', title, action, message: CONVERSION_CHECK_FAILED };
  return {
    phase: state.k,
    title,
    action,
    lead: conversionLead(to, state.losses),
    lines: state.losses.map((loss) => conversionLine(loss, to)),
  };
}

export function ConversionDialog({
  state,
  onConfirm,
  onRetry,
  onCancel,
}: {
  state: ConversionState;
  onConfirm: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <OfficeConversionDialog
      view={viewOf(state)}
      onConfirm={onConfirm}
      onRetry={onRetry}
      onCancel={onCancel}
    />
  );
}
