// A worker issue as the Bug Tracker keeps it (docs/specs/016-platform/worker-issues.md "Reading the payload", "The
// issue card"): what a Workers Issues delivery named, already bounded and stripped of addresses by the receiver.
// Pure, so a stored or held issue makes the same card when it is refiled.

export const WORKER_ISSUE_TRIGGERS = ['first_sight', 'recurrence', 'unknown'] as const;
export type WorkerIssueTrigger = (typeof WORKER_ISSUE_TRIGGERS)[number];

export type WorkerIssue = {
  trigger: WorkerIssueTrigger;
  worker?: string;
  issueId?: string;
  title?: string;
  error?: string;
  stack?: string;
  route?: string;
  status?: number;
  count?: number;
  firstSeen?: string;
  lastSeen?: string;
  version?: string;
  link?: string;
  summary?: string;
  other?: string;
};

// How long each kept text may be, in characters (the spec's bounds, default). A worker name is at most 63 on
// Cloudflare; a stack's first 6,000 characters hold its frames that matter.
export const WORKER_ISSUE_LIMITS = {
  worker: 64,
  issueId: 128,
  title: 300,
  error: 500,
  stack: 6_000,
  route: 300,
  version: 64,
  link: 500,
  summary: 2_000,
  other: 2_000,
  time: 40,
} as const;

// The label every issue card carries, so it is told apart from a person's report at a glance.
export const WORKER_ISSUE_LABEL = 'Worker Issue';
// The card's Reporter line: Cloudflare's product, never a person.
export const WORKER_ISSUES_REPORTER = 'Workers Issues';

const UNNAMED = 'Unnamed worker error';
// A board label's longest (`ITEM_LABEL_MAX` in @livedoc/items).
const LABEL_MAX = 32;

const TRIGGER_WORDS: Readonly<Record<WorkerIssueTrigger, string>> = {
  first_sight: 'First sight',
  recurrence: 'Back after a quiet spell',
  unknown: 'Unknown',
};

type TextField = Exclude<keyof typeof WORKER_ISSUE_LIMITS, 'time'>;
const TEXT_FIELDS: readonly TextField[] = [
  'worker',
  'issueId',
  'title',
  'error',
  'stack',
  'route',
  'version',
  'link',
  'summary',
  'other',
];

const firstLine = (s: string) => s.split('\n', 1)[0]!.trim();

// The card's title: the worker, then what went wrong.
export function workerIssueTitle(issue: WorkerIssue): string {
  const what = issue.title || issue.error || (issue.summary && firstLine(issue.summary)) || UNNAMED;
  return issue.worker ? `${issue.worker}: ${what}` : what;
}

export function workerIssueLabels(issue: WorkerIssue): string[] {
  return issue.worker
    ? [WORKER_ISSUE_LABEL, issue.worker.slice(0, LABEL_MAX)]
    : [WORKER_ISSUE_LABEL];
}

// "2026-11-10 22:11 UTC" from an ISO time, or the text as it came.
function minuteOf(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]} UTC` : iso;
}

export type WorkerIssueLine = { label: string; value: string };

// The card's Context: one line per thing the delivery named, in the spec's order.
export function workerIssueContextLines(issue: WorkerIssue): WorkerIssueLine[] {
  const lines: WorkerIssueLine[] = [];
  const add = (label: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') lines.push({ label, value: String(value) });
  };
  add('Worker', issue.worker);
  add('Trigger', TRIGGER_WORDS[issue.trigger]);
  add('Error', issue.error);
  add('Route', issue.route);
  add('Status', issue.status);
  add('Count', issue.count);
  add('First seen', issue.firstSeen && minuteOf(issue.firstSeen));
  add('Last seen', issue.lastSeen && minuteOf(issue.lastSeen));
  add('Version', issue.version);
  add('Issue', issue.issueId);
  add('Issue link', issue.link);
  return lines;
}

// The card's Details: the stack, Cloudflare's summary and the other fields, each under its heading.
export function workerIssueDetails(issue: WorkerIssue): string {
  return [
    issue.stack && `Stack:\n${issue.stack}`,
    issue.summary && `Cloudflare's summary:\n${issue.summary}`,
    issue.other && `Other fields:\n${issue.other}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isTrigger = (v: unknown): v is WorkerIssueTrigger =>
  typeof v === 'string' && (WORKER_ISSUE_TRIGGERS as readonly string[]).includes(v);

const isWhole = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

// A stored or held issue read back: its trigger is required; any other field of the wrong type is dropped, and every
// text is cut to its bound again, so a row written by an older build still makes a card.
export function parseWorkerIssue(raw: unknown): WorkerIssue | null {
  if (!isRecord(raw) || !isTrigger(raw['trigger'])) return null;
  const issue: WorkerIssue = { trigger: raw['trigger'] };
  for (const field of TEXT_FIELDS) {
    const value = raw[field];
    if (typeof value === 'string' && value)
      issue[field] = value.slice(0, WORKER_ISSUE_LIMITS[field]);
  }
  if (isWhole(raw['status'], 100, 599)) issue.status = raw['status'];
  if (isWhole(raw['count'], 0, Number.MAX_SAFE_INTEGER)) issue.count = raw['count'];
  for (const field of ['firstSeen', 'lastSeen'] as const) {
    const value = raw[field];
    if (typeof value === 'string' && value) issue[field] = value.slice(0, WORKER_ISSUE_LIMITS.time);
  }
  return issue;
}
