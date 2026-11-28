'use client';

// A text document's import report (docs/specs/034-text-documents/files-and-print.md "Import report"): shown once, as
// the document first loads, to the person who opened the file (the wait File > Open left in this browser), and
// reopened by anyone from File > Security limitations. The report itself is the document's, written by the room.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type * as Y from 'yjs';
import { TextDocumentState } from '@livedoc/text-documents';
import { OfficeReportDialog } from '@/components/office/OfficeReportDialog';
import { debugLog } from '@/lib/debug-log';
import {
  dismissImportReport,
  subscribeImportReports,
  waitingImportReport,
} from '@/lib/office/import-report-handoff';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import {
  openedReportView,
  securityLimitationsView,
  type TextDocumentReportView,
} from '@/lib/text-document/text-document-report';

export const SECURITY_LIMITATIONS_ITEM = 'security-limitations';

export function useTextDocumentReport({
  doc,
  documentId,
  name,
}: {
  /** The loaded writing's state, null until it has loaded. */
  readonly doc: Y.Doc | null;
  readonly documentId: string;
  readonly name: string;
}): { readonly actions: OfficeActions; readonly dialog: ReactNode } {
  const [reopened, setReopened] = useState<TextDocumentReportView | null>(null);
  // A static page has no wait: it is left in the browser's session storage.
  const waiting = useSyncExternalStore(
    subscribeImportReports,
    () => waitingImportReport(documentId) !== null,
    () => false,
  );
  // The room writes the report with the file's first update, so it is there once the writing has loaded.
  const once = useMemo(
    () => (doc && waiting ? openedReportView(TextDocumentState.report(doc), name) : null),
    [doc, waiting, name],
  );
  const nothingToShow = doc !== null && waiting && once === null;

  useEffect(() => {
    // The file dropped and kept nothing: there is nothing to show, now or later.
    if (!nothingToShow) return;
    debugLog('[text-document] import report none', { documentId });
    dismissImportReport(documentId);
  }, [nothingToShow, documentId]);
  useEffect(() => {
    if (once) debugLog('[text-document] import report shown', { once: true, documentId });
  }, [once, documentId]);

  const reopen = useCallback(() => {
    if (!doc) return;
    const report = TextDocumentState.report(doc);
    track('UI', 'Used', 'TextDocumentSecurityLimitations');
    debugLog('[text-document] import report shown', {
      once: false,
      opened: report.imported !== null,
      converted: report.converted.length,
    });
    setReopened(securityLimitationsView(report));
  }, [doc]);

  const actions = useMemo(
    (): OfficeActions => ({ [SECURITY_LIMITATIONS_ITEM]: { run: reopen } }),
    [reopen],
  );
  const shown = reopened ?? once;
  const close = () => {
    if (reopened) setReopened(null);
    else dismissImportReport(documentId);
  };
  return {
    actions,
    dialog: shown ? (
      <OfficeReportDialog
        title={shown.title}
        sections={shown.sections}
        empty={shown.empty}
        onClose={close}
      />
    ) : null,
  };
}
