'use client';

// The office shell's report dialog (docs/specs/029-sheets/files-and-print.md "The import report";
// docs/specs/034-text-documents/files-and-print.md "Import report"): a title, then sections of lines, each with an
// optional heading and lead, or one sentence when there is nothing to list; OK closes. Presentational: each kind says
// what it lists and when.
import { Button } from '@livedoc/ui';
import { Dialog } from '@/components/dialogs/Dialog';
import { DialogFooter } from '@/components/dialogs/DialogFooter';

export type OfficeReportSection = {
  readonly heading?: string;
  readonly lead?: string;
  readonly lines: readonly string[];
};

const TITLE_ID = 'office-report-title';

export function OfficeReportDialog({
  title,
  sections,
  empty,
  onClose,
}: {
  readonly title: string;
  readonly sections: readonly OfficeReportSection[];
  /** Said when no section has a line. */
  readonly empty?: string;
  readonly onClose: () => void;
}) {
  const listed = sections.filter((section) => section.lines.length > 0);
  return (
    <Dialog open onClose={onClose} titleId={TITLE_ID}>
      <div
        data-import-report
        className="max-h-[70vh] overflow-y-auto border-b border-slate-100 px-6 pt-6 pb-4 dark:border-slate-800"
      >
        <h2 id={TITLE_ID} className="text-dialog-title text-slate-900 dark:text-slate-50">
          {title}
        </h2>
        <div className="mt-2 space-y-4 text-body text-slate-600 dark:text-slate-300">
          {listed.length === 0 && empty ? <p>{empty}</p> : null}
          {listed.map((section, index) => (
            <section key={`${index}-${section.heading ?? ''}`}>
              {section.heading ? (
                <h3 className="font-medium text-slate-900 dark:text-slate-50">{section.heading}</h3>
              ) : null}
              {section.lead ? <p>{section.lead}</p> : null}
              {/* A long name (a file's own part or range name) wraps rather than running past the dialog. */}
              <ul className="mt-2 list-disc space-y-1 pl-4 [overflow-wrap:anywhere]">
                {section.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button variant="primary" onClick={onClose}>
          OK
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
