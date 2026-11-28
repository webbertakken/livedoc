'use client';

// The conversion dialog every office kind shares (docs/specs/029-sheets/files-and-print.md "Converting",
// docs/specs/034-text-documents/standard-mapping.md "Conversion"): what the other format's file cannot hold, listed
// before a conversion or a converted download runs, with Convert (or Download) and Cancel. Each kind words its own
// title, lead and lines; this draws them.
import { Button } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';

const TITLE_ID = 'conversion-dialog-title';

/** What the dialog shows: checking or failed say a sentence; listed and running show the lead and the losses. */
export type OfficeConversionView =
  | { phase: 'checking' | 'failed'; title: string; action: string; message: string }
  | {
      phase: 'listed' | 'running';
      title: string;
      action: string;
      lead: string;
      lines: readonly string[];
    };

export function OfficeConversionDialog({
  view,
  onConfirm,
  onRetry,
  onCancel,
}: {
  view: OfficeConversionView | null;
  onConfirm: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  if (!view) return null;
  return (
    <Dialog open onClose={onCancel} titleId={TITLE_ID}>
      <div
        data-conversion-dialog={view.phase}
        className="border-b border-slate-100 px-6 pt-6 pb-4 dark:border-slate-800"
      >
        <h2 id={TITLE_ID} className="text-dialog-title text-slate-900 dark:text-slate-50">
          {view.title}
        </h2>
        <div className="mt-2 text-body text-slate-600 dark:text-slate-300">
          {view.phase === 'checking' ? <p role="status">{view.message}</p> : null}
          {view.phase === 'failed' ? <p role="alert">{view.message}</p> : null}
          {view.phase === 'listed' || view.phase === 'running' ? (
            <>
              <p>{view.lead}</p>
              {view.lines.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-4 [overflow-wrap:anywhere]">
                  {view.lines.map((line) => (
                    <li key={line}>{line}</li>
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
        {view.phase === 'failed' ? (
          <Button variant="primary" onClick={onRetry}>
            Try Again
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={view.phase !== 'listed'}
            aria-busy={view.phase === 'running'}
            onClick={onConfirm}
          >
            {view.action}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
