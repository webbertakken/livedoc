import { describe, expect, it } from 'vitest';
import {
  parseWorkerIssue,
  WORKER_ISSUE_LIMITS,
  workerIssueContextLines,
  workerIssueDetails,
  workerIssueColumnName,
  workerIssueLabels,
  workerIssueTitle,
  type WorkerIssue,
} from './worker-issue';

// docs/specs/016-platform/worker-issues.md "The issue card".

const full: WorkerIssue = {
  trigger: 'first_sight',
  worker: 'docs-nu-api',
  issueType: 'exception',
  issueId: 'iss_1',
  title: "TypeError: Cannot read properties of undefined (reading 'id')",
  error: "TypeError: Cannot read properties of undefined (reading 'id')",
  stack: 'TypeError: boom\n    at home (src/home/route.ts:12:3)',
  route: 'GET /api/home',
  status: 500,
  count: 2,
  firstSeen: '2026-11-10T22:11:00.000Z',
  lastSeen: '2026-11-10T22:11:02.000Z',
  version: 'v-123',
  link: 'https://dash.cloudflare.com/abc/workers/services/view/docs-nu-api/production/issues?status=active',
  summary: 'An issue in docs-nu-api crossed its threshold.',
  other: 'alert_type: workers_issue',
};

describe('workerIssueTitle', () => {
  it('leads with the worker, then the issue title', () => {
    expect(workerIssueTitle(full)).toBe(`docs-nu-api: ${full.title}`);
  });

  it('falls back to the error, then the summary, then a name for the unnamed', () => {
    expect(workerIssueTitle({ trigger: 'unknown', worker: 'w', error: 'E: x' })).toBe('w: E: x');
    expect(workerIssueTitle({ trigger: 'unknown', summary: 'Something broke' })).toBe(
      'Something broke',
    );
    expect(workerIssueTitle({ trigger: 'unknown' })).toBe('Unnamed worker error');
  });

  it('takes the first line of a many-line summary', () => {
    expect(workerIssueTitle({ trigger: 'unknown', summary: 'First\nsecond' })).toBe('First');
  });
});

describe('workerIssueLabels', () => {
  it('marks the card and names its worker', () => {
    expect(workerIssueLabels(full)).toEqual(['Worker Issue', 'docs-nu-api']);
  });

  it('marks the card alone when the worker is unknown', () => {
    expect(workerIssueLabels({ trigger: 'unknown' })).toEqual(['Worker Issue']);
  });

  it('adds Security to a security issue, with or without its worker', () => {
    expect(workerIssueLabels({ ...full, issueType: 'security' })).toEqual([
      'Worker Issue',
      'docs-nu-api',
      'Security',
    ]);
    expect(workerIssueLabels({ trigger: 'unknown', issueType: 'security' })).toEqual([
      'Worker Issue',
      'Security',
    ]);
  });

  it('cuts a long worker name to a label', () => {
    const [, worker] = workerIssueLabels({ trigger: 'unknown', worker: 'w'.repeat(64) });
    expect(worker).toHaveLength(32);
  });
});

describe('workerIssueColumnName', () => {
  it('files a security issue in the Security column, any other in the first', () => {
    expect(workerIssueColumnName({ trigger: 'unknown', issueType: 'security' })).toBe('Security');
    expect(workerIssueColumnName(full)).toBeUndefined();
    expect(workerIssueColumnName({ trigger: 'unknown' })).toBeUndefined();
  });
});

describe('workerIssueContextLines', () => {
  it('lists what the delivery named, in the card order', () => {
    expect(workerIssueContextLines(full)).toEqual([
      { label: 'Worker', value: 'docs-nu-api' },
      { label: 'Type', value: 'Exception' },
      { label: 'Trigger', value: 'First sight' },
      { label: 'Error', value: full.error },
      { label: 'Route', value: 'GET /api/home' },
      { label: 'Status', value: '500' },
      { label: 'Count', value: '2' },
      { label: 'First seen', value: '2026-11-10 22:11 UTC' },
      { label: 'Last seen', value: '2026-11-10 22:11 UTC' },
      { label: 'Version', value: 'v-123' },
      { label: 'Issue', value: 'iss_1' },
      { label: 'Issue link', value: full.link },
    ]);
  });

  it.each([
    ['recurrence', 'Back after a quiet spell'],
    ['unknown', 'Unknown'],
  ] as const)('names the %s trigger', (trigger, value) => {
    expect(workerIssueContextLines({ trigger })).toEqual([{ label: 'Trigger', value }]);
  });

  it('words a type Cloudflare adds later', () => {
    expect(workerIssueContextLines({ trigger: 'unknown', issueType: 'cpu_limit' })[0]).toEqual({
      label: 'Type',
      value: 'Cpu limit',
    });
  });
});

describe('workerIssueDetails', () => {
  it('holds the stack, the summary and the other fields', () => {
    expect(workerIssueDetails(full)).toBe(
      [
        `Stack:\n${full.stack}`,
        `Cloudflare's summary:\n${full.summary}`,
        `Other fields:\n${full.other}`,
      ].join('\n\n'),
    );
  });

  it('is empty when there is nothing to hold', () => {
    expect(workerIssueDetails({ trigger: 'unknown' })).toBe('');
  });
});

describe('parseWorkerIssue', () => {
  it('reads back what it wrote', () => {
    expect(parseWorkerIssue(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });

  it('refuses what is not an issue', () => {
    expect(parseWorkerIssue(null)).toBeNull();
    expect(parseWorkerIssue('x')).toBeNull();
    expect(parseWorkerIssue({ trigger: 'sometimes' })).toBeNull();
  });

  it('drops fields of the wrong type and cuts the long ones', () => {
    const parsed = parseWorkerIssue({
      trigger: 'recurrence',
      worker: 7,
      status: 'x',
      count: -1,
      stack: 's'.repeat(WORKER_ISSUE_LIMITS.stack + 10),
    });
    expect(parsed).toEqual({ trigger: 'recurrence', stack: 's'.repeat(WORKER_ISSUE_LIMITS.stack) });
  });
});
