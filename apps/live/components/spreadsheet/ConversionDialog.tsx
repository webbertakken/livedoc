'use client';

// The conversion dialog (docs/specs/029-sheets/files-and-print.md "Converting", D88): what the other format's file
// cannot hold, listed before a conversion or a converted download runs, with Convert (or Download) and Cancel.
import { Button } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';
import {
  CONVERSION_CHECK_FAILED,
  conversionChecking,
  conversionLead,
  conversionLine,
  conversionTitle,
} from '@/lib/spreadsheet/conversion-copy';
import type { ConversionState } from './useWorkbookConversion';

const TITLE_ID = 'conversion-dialog-title';

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
  if (state.k === 'closed') return null;
  const { purpose, to } = state;
  const action = purpose === 'convert' ? 'Convert' : 'Download';
  return (
    <Dialog open onClose={onCancel} titleId={TITLE_ID}>
      <div
        data-conversion-dialog={state.k}
        className="border-b border-slate-100 px-6 pt-6 pb-4 dark:border-slate-800"
      >
        <h2 id={TITLE_ID} className="text-lg font-semibold text-slate-900 dark:text-slate-50">
          {conversionTitle(purpose, to)}
        </h2>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {state.k === 'checking' ? <p role="status">{conversionChecking(to)}</p> : null}
          {state.k === 'failed' ? <p role="alert">{CONVERSION_CHECK_FAILED}</p> : null}
          {state.k === 'listed' || state.k === 'running' ? (
            <>
              <p>{conversionLead(to, state.losses)}</p>
              {state.losses.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {state.losses.map((loss) => (
                    <li key={loss.k}>{conversionLine(loss, to)}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        {state.k === 'failed' ? (
          <Button variant="primary" onClick={onRetry}>
            Try Again
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={state.k !== 'listed'}
            aria-busy={state.k === 'running'}
            onClick={onConfirm}
          >
            {action}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
