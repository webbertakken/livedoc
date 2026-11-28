'use client';

// The import report (docs/specs/029-sheets/files-and-print.md "The import report", D120): on the spreadsheet a file
// made, until closed, what the file held that the spreadsheet does not, a line a kind, with OK.
import { useSyncExternalStore } from 'react';
import { IMPORT_REPORT_LEAD, importReportTitle } from '@livedoc/sheets/files';
import { OfficeReportDialog } from '@/components/office/OfficeReportDialog';
import {
  dismissImportReport,
  subscribeImportReports,
  waitingImportReport,
} from '@/lib/office/import-report-handoff';

export function ImportReportDialog({ documentId }: { documentId: string }) {
  // A static page has no report: it waits in the browser's session storage.
  const report = useSyncExternalStore(
    subscribeImportReports,
    () => waitingImportReport(documentId),
    () => null,
  );
  if (!report || report.lines.length === 0) return null;
  return (
    <OfficeReportDialog
      title={importReportTitle(report.name)}
      sections={[{ lead: IMPORT_REPORT_LEAD, lines: report.lines }]}
      onClose={() => dismissImportReport(documentId)}
    />
  );
}
