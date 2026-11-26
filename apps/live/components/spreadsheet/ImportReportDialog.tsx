'use client';

// The import report (docs/specs/029-sheets/files-and-print.md "The import report", D120): on the spreadsheet a file
// made, until closed, what the file held that the spreadsheet does not, a line a kind, with OK.
import { useSyncExternalStore } from 'react';
import { Button } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';
import { IMPORT_REPORT_LEAD, importReportTitle } from '@livedoc/sheets/files';
import {
  dismissImportReport,
  subscribeImportReports,
  waitingImportReport,
} from '@/lib/spreadsheet/import-report-handoff';

const TITLE_ID = 'import-report-title';

export function ImportReportDialog({ documentId }: { documentId: string }) {
  // A static page has no report: it waits in the browser's session storage.
  const report = useSyncExternalStore(
    subscribeImportReports,
    () => waitingImportReport(documentId),
    () => null,
  );
  if (!report) return null;
  const close = () => dismissImportReport(documentId);
  return (
    <Dialog open onClose={close} titleId={TITLE_ID}>
      <div
        data-import-report
        className="border-b border-slate-100 px-6 pt-6 pb-4 dark:border-slate-800"
      >
        <h2 id={TITLE_ID} className="text-dialog-title text-slate-900 dark:text-slate-50">
          {importReportTitle(report.name)}
        </h2>
        <div className="mt-2 text-body text-slate-600 dark:text-slate-300">
          <p>{IMPORT_REPORT_LEAD}</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {report.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
      <DialogFooter>
        <Button variant="primary" onClick={close}>
          OK
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
