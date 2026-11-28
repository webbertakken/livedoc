// The text document's import report as the office shell's report dialog lists it
// (docs/specs/034-text-documents/files-and-print.md "Import report"): once, after opening a file, what reading it
// dropped and kept; reopened from File > Security limitations, that and each conversion's losses, newest first.
import {
  convertedHeading,
  convertedLines,
  interruptsOpener,
  openedHeading,
  openedLines,
  openedTitle,
  OPENED_LEAD,
  REPORT_EMPTY,
  SECURITY_LIMITATIONS_TITLE,
  type TextDocumentReport,
} from '@livedoc/text-documents';
import type { OfficeReportSection } from '@/components/office/OfficeReportDialog';

export type TextDocumentReportView = {
  readonly title: string;
  readonly sections: readonly OfficeReportSection[];
  readonly empty?: string;
};

/** The report shown once to the person who opened the file, or null when reading it dropped nothing a reader would
 *  miss (housekeeping stays in Security limitations). */
export function openedReportView(
  report: TextDocumentReport,
  name: string,
): TextDocumentReportView | null {
  if (!report.imported || !interruptsOpener(report.imported)) return null;
  return {
    title: openedTitle(name),
    sections: [{ lead: OPENED_LEAD, lines: openedLines(report.imported) }],
  };
}

/** Security limitations: the Opened section, then each conversion newest first, or the sentence saying none. */
export function securityLimitationsView(report: TextDocumentReport): TextDocumentReportView {
  return {
    title: SECURITY_LIMITATIONS_TITLE,
    sections: [
      ...(report.imported
        ? [{ heading: openedHeading(report.imported), lines: openedLines(report.imported) }]
        : []),
      ...[...report.converted]
        .reverse()
        .map((record) => ({ heading: convertedHeading(record), lines: convertedLines(record) })),
    ],
    empty: REPORT_EMPTY,
  };
}
