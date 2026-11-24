// What's Attached (docs/specs/016-platform/bug-reports.md "The form" item 4): every context line in plain words, who
// the report names and the screenshot, in a closed disclosure.
import { bugReportContextLines, type BugReportContext } from '@livedoc/api-schema';
import { BUG_REPORT_COPY as COPY } from './bug-report-copy';

export type BugReportYou = 'account' | 'guest' | 'none';

const YOU: Record<BugReportYou, string> = {
  account: COPY.youAccount,
  guest: COPY.youGuest,
  none: COPY.youNone,
};

export function BugReportAttached({
  context,
  you,
  screenshot,
}: {
  context: BugReportContext;
  you: BugReportYou;
  screenshot: boolean;
}) {
  const lines = [
    ...bugReportContextLines(context),
    { label: 'You', value: YOU[you] },
    ...(screenshot ? [{ label: 'Screenshot', value: 'Attached' }] : []),
  ];
  return (
    <details className="rounded-control border border-slate-200 px-3 py-2 text-supporting text-slate-600 dark:border-slate-700 dark:text-slate-300">
      <summary className="cursor-pointer text-body text-slate-700 dark:text-slate-200">
        {COPY.attached}
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {lines.map((l, i) => (
          <div key={`${l.label}-${i}`} className="contents">
            <dt className="font-medium">{l.label}</dt>
            <dd className="min-w-0 break-words">{l.value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
