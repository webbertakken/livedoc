'use client';

// The app's root error boundary (docs/specs/016-platform/stale-builds.md "The safety net"): a chunk
// from an earlier build that failed to load becomes a full page load of where the user was going;
// anything else, or a second failure inside the loop guard's window, shows this calm page in the
// app's own look instead of the framework's.
import { useEffect } from 'react';
import { Button, REPORT_A_BUG_PATH } from '@livedoc/ui';
import { browserNavigationDeps, recoverInBrowser } from '@/lib/stale-build-navigation';
import './globals.css';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error] the page failed', error);
    void recoverInBrowser(error, browserNavigationDeps());
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-800 antialiased dark:bg-slate-950 dark:text-slate-100">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-name">This page couldn&apos;t load</h1>
          <p className="text-body text-slate-600 dark:text-slate-300">Reload to try again.</p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
          {/* The root failed, so no form is mounted: the form's own page (docs/specs/016-platform/bug-reports.md). */}
          <a
            href={REPORT_A_BUG_PATH}
            data-bug-report-entry=""
            className="text-body text-brand-700 underline underline-offset-2 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
          >
            Report a Bug
          </a>
        </main>
      </body>
    </html>
  );
}
