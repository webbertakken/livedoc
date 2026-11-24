'use client';

// The standalone Report a Bug page (docs/specs/016-platform/bug-reports.md "Entries"): the form opens at once over a
// plain page; closing it goes back to the page the reporter came from, else home. `?from=` only names that page in
// the report's context; it never decides where the browser goes.
import { useEffect, useRef } from 'react';
import { Brand, Button } from '@livedoc/ui';
import { BUG_REPORT_COPY as COPY } from './bug-report-copy';
import { useOpenBugReport } from './BugReportProvider';

export function leaveReportPage(view: Pick<Window, 'history' | 'location'> = window): void {
  if (view.history.length > 1) view.history.back();
  else view.location.assign('/');
}

export function ReportABugPage() {
  const open = useOpenBugReport();
  const reopenRef = useRef<HTMLButtonElement>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    open({ trigger: reopenRef.current, onClosed: () => leaveReportPage() });
  }, [open]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Brand href="/" size="lg" />
      <h1 className="text-page-title text-slate-900 dark:text-slate-100">{COPY.name}</h1>
      <p className="max-w-sm text-body text-slate-600 dark:text-slate-300">
        {COPY.entryDescription}
      </p>
      <Button
        ref={reopenRef}
        variant="secondary"
        aria-haspopup="dialog"
        onClick={(e) => open({ trigger: e.currentTarget, onClosed: () => leaveReportPage() })}
      >
        {COPY.name}
      </Button>
    </main>
  );
}
