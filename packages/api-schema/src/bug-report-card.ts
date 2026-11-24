// The card a bug report makes on the Bug Tracker's board (docs/specs/016-platform/bug-reports.md "The Bug Tracker
// board"): the title, the details as the card's Details, and the Context, Screenshot, Reporter and Release fields of
// the Bug Report card type, found by label. Severity is left for triage. Pure, so a refile makes the same card.
// A worker issue (docs/specs/016-platform/worker-issues.md "The issue card") makes the same card with a marked origin:
// its Context from the issue, its stack in Details, and the Worker Issue label.
import {
  ITEM_DESCRIPTION_MAX,
  ITEM_TITLE_MAX,
  ITEM_UNKNOWN_STRING_MAX,
  type ItemFields,
  type ItemTypeDef,
} from '@livedoc/items';
import type { BugReportContext } from './bug-report';
import { bugReportContextLines } from './bug-report-context-lines';
import {
  WORKER_ISSUES_REPORTER,
  workerIssueContextLines,
  workerIssueDetails,
  workerIssueColumnName,
  workerIssueLabels,
  workerIssueTitle,
  type WorkerIssue,
} from './worker-issue';

export const BUG_REPORT_TYPE_LABEL = 'Bug Report';

// Who sent a report, as the api resolved it: never from the report itself. Workers Issues is Cloudflare's error
// monitoring, reporting a worker issue through the api's receiver.
export type BugReporter =
  | { kind: 'account' | 'guest'; id: string }
  | { kind: 'anonymous'; id: null }
  | { kind: 'workers-issues'; id: null };

// What a card is made from: the report, its reporter and its screenshot's link, or a worker issue. It crosses into
// the Bug Tracker's room, and is what a stored report keeps.
export type BugReportFiling = {
  title: string;
  details?: string;
  context?: BugReportContext;
  screenshotUrl?: string;
  reporter: BugReporter;
  issue?: WorkerIssue;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function findBugReportType(types: readonly ItemTypeDef[]): ItemTypeDef | undefined {
  return types.find((t) => same(t.label, BUG_REPORT_TYPE_LABEL));
}

// The Reporter field: the id in a code span, so it reads as an id and nothing else.
export function reporterLine(reporter: BugReporter): string {
  if (reporter.kind === 'anonymous') return 'Anonymous';
  if (reporter.kind === 'workers-issues') return WORKER_ISSUES_REPORTER;
  return `${reporter.kind === 'account' ? 'Account' : 'Guest'} \`${reporter.id}\``;
}

const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const linesText = (lines: readonly { label: string; value: string }[]) =>
  lines.map((l) => `${l.label}: ${l.value}`).join('\n');

function contextText(filing: BugReportFiling): string | undefined {
  if (filing.issue) return linesText(workerIssueContextLines(filing.issue));
  return filing.context ? linesText(bugReportContextLines(filing.context)) : undefined;
}

export function bugReportCard(
  filing: BugReportFiling,
  type: ItemTypeDef,
): { type: string; fields: ItemFields } {
  const fields: ItemFields = { title: cut(filing.title, ITEM_TITLE_MAX) };
  if (filing.issue) fields['labels'] = workerIssueLabels(filing.issue);
  const custom = type.custom ?? [];
  const pieces: { label: string; value: string | undefined }[] = [
    { label: 'Context', value: contextText(filing) },
    { label: 'Screenshot', value: filing.screenshotUrl },
    { label: 'Reporter', value: reporterLine(filing.reporter) },
    { label: 'Release', value: filing.issue ? filing.issue.version : filing.context?.release },
  ];
  const leftovers: string[] = [];
  for (const { label, value } of pieces) {
    if (!value) continue;
    const field = custom.find((f) => same(f.label, label));
    if (field) fields[field.id] = cut(value, ITEM_UNKNOWN_STRING_MAX);
    else leftovers.push(`${label}:\n${value}`);
  }
  const details = filing.issue ? workerIssueDetails(filing.issue) : filing.details;
  const description = [details, ...leftovers].filter(Boolean).join('\n\n');
  if (description) fields['description'] = cut(description, ITEM_DESCRIPTION_MAX);
  return { type: type.id, fields };
}

// What a worker issue files: its title, Workers Issues as the reporter, and the issue itself.
export function workerIssueFiling(issue: WorkerIssue): BugReportFiling {
  return { title: workerIssueTitle(issue), reporter: { kind: 'workers-issues', id: null }, issue };
}

// The column a card is filed in (docs/specs/016-platform/worker-issues.md "The issue card"): a security issue in the
// column named Security, case apart, when the board has one; everything else in the first column.
export function bugReportColumn<C extends { name: string }>(
  filing: BugReportFiling,
  columns: readonly C[],
): C | undefined {
  const wanted = filing.issue && workerIssueColumnName(filing.issue);
  return (wanted && columns.find((c) => same(c.name, wanted))) || columns[0];
}
