import { describe, expect, it } from 'vitest';
import { ITEM_UNKNOWN_STRING_MAX, type ItemTypeDef } from '@livedoc/items';
import type { BugReportContext } from './bug-report';
import type { WorkerIssue } from './worker-issue';
import {
  BUG_REPORT_TYPE_LABEL,
  bugReportCard,
  bugReportColumn,
  findBugReportType,
  reporterLine,
  workerIssueFiling,
  type BugReportFiling,
} from './bug-report-card';

// docs/specs/016-platform/bug-reports.md "The Bug Tracker board".

const fullType: ItemTypeDef = {
  id: 'bug-report',
  label: 'Bug Report',
  newTitle: 'New bug report',
  glyph: 'bug',
  color: '#dc2626',
  fields: ['title', 'status', 'description', 'f-sev', 'f-ctx', 'f-shot', 'f-rep', 'f-rel'],
  custom: [
    {
      id: 'f-sev',
      label: 'Severity',
      kind: 'choice',
      options: ['Low', 'Medium', 'High', 'Critical'],
    },
    { id: 'f-ctx', label: 'Context', kind: 'longtext' },
    { id: 'f-shot', label: 'Screenshot', kind: 'link' },
    { id: 'f-rep', label: 'reporter', kind: 'text' },
    { id: 'f-rel', label: 'Release', kind: 'text' },
  ],
};

const context: BugReportContext = {
  route: '/document',
  mode: 'draw',
  release: 'abc1234',
  viewport: { width: 1280, height: 800, pixelRatio: 1 },
  online: true,
  recentErrors: [],
};

const filing = (extra: Partial<BugReportFiling> = {}): BugReportFiling => ({
  title: 'Save fails',
  details: 'It spins forever.',
  context,
  screenshotUrl: 'https://docs.nu/report-a-bug/screenshot?key=k',
  reporter: { kind: 'guest', id: 'g-123' },
  ...extra,
});

describe('reporterLine', () => {
  it.each([
    [{ kind: 'account', id: 'acc_1' }, 'Account `acc_1`'],
    [{ kind: 'guest', id: 'g-1' }, 'Guest `g-1`'],
    [{ kind: 'anonymous', id: null }, 'Anonymous'],
  ] as const)('says %j as %s', (reporter, line) => {
    expect(reporterLine(reporter)).toBe(line);
  });
});

describe('findBugReportType', () => {
  it('finds the type by label, case apart', () => {
    const other = { ...fullType, id: 'task', label: 'Task' };
    expect(findBugReportType([other, { ...fullType, label: 'bug report' }])?.id).toBe('bug-report');
    expect(BUG_REPORT_TYPE_LABEL).toBe('Bug Report');
  });

  it('answers undefined without one', () => {
    expect(findBugReportType([{ ...fullType, label: 'Bug' }])).toBeUndefined();
  });
});

describe('bugReportCard', () => {
  it('fills each field the type has, Severity left unset', () => {
    const card = bugReportCard(filing(), fullType);
    expect(card.type).toBe('bug-report');
    expect(card.fields).toEqual({
      title: 'Save fails',
      description: 'It spins forever.',
      'f-ctx':
        'Page: /document\nMode: Sketch\nApp version: abc1234\nScreen: 1280 × 800 at 1x\nOnline: Yes\nRecent errors: None',
      'f-shot': 'https://docs.nu/report-a-bug/screenshot?key=k',
      'f-rep': 'Guest `g-123`',
      'f-rel': 'abc1234',
    });
  });

  it('leaves out what the report does not have', () => {
    const card = bugReportCard({ title: 'x', reporter: { kind: 'anonymous', id: null } }, fullType);
    expect(card.fields).toEqual({ title: 'x', 'f-rep': 'Anonymous' });
  });

  it('writes what the type has no field for into the description under its label', () => {
    const bare = { ...fullType, custom: [] };
    const card = bugReportCard(filing(), bare);
    expect(card.fields['description']).toBe(
      [
        'It spins forever.',
        '',
        'Context:',
        'Page: /document\nMode: Sketch\nApp version: abc1234\nScreen: 1280 × 800 at 1x\nOnline: Yes\nRecent errors: None',
        '',
        'Screenshot:',
        'https://docs.nu/report-a-bug/screenshot?key=k',
        '',
        'Reporter:',
        'Guest `g-123`',
        '',
        'Release:',
        'abc1234',
      ].join('\n'),
    );
  });

  it('cuts a field to what the item store keeps', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      at: '2026-10-28T10:00:00.000Z',
      source: 'api' as const,
      message: `${i}${'m'.repeat(450)}`,
    }));
    const card = bugReportCard(filing({ context: { ...context, recentErrors: many } }), fullType);
    expect((card.fields['f-ctx'] as string).length).toBeLessThanOrEqual(ITEM_UNKNOWN_STRING_MAX);
  });
});

// docs/specs/016-platform/worker-issues.md "The issue card": a Bug Report card with a marked origin.
describe('bugReportCard for a worker issue', () => {
  const issue: WorkerIssue = {
    trigger: 'first_sight',
    worker: 'docs-nu-api',
    title: 'TypeError: boom',
    error: 'TypeError: boom',
    stack: 'TypeError: boom\n    at home (route.ts:1:2)',
    route: 'GET /api/home',
    version: 'v-9',
  };
  const issueFiling: BugReportFiling = {
    title: 'docs-nu-api: TypeError: boom',
    reporter: { kind: 'workers-issues', id: null },
    issue,
  };

  it('fills Context from the issue, labels it, and says Workers Issues reported it', () => {
    const card = bugReportCard(issueFiling, fullType);
    expect(card.fields).toEqual({
      title: 'docs-nu-api: TypeError: boom',
      labels: ['Worker Issue', 'docs-nu-api'],
      description: 'Stack:\nTypeError: boom\n    at home (route.ts:1:2)',
      'f-ctx':
        'Worker: docs-nu-api\nTrigger: First sight\nError: TypeError: boom\nRoute: GET /api/home\nVersion: v-9',
      'f-rep': 'Workers Issues',
      'f-rel': 'v-9',
    });
  });

  it('says Workers Issues for its reporter line', () => {
    expect(reporterLine({ kind: 'workers-issues', id: null })).toBe('Workers Issues');
  });

  it('keeps the stack in the description ahead of fields the type lacks', () => {
    const card = bugReportCard(issueFiling, { ...fullType, custom: [] });
    expect(card.fields['description']).toMatch(
      /^Stack:\nTypeError: boom[\s\S]*\n\nContext:\nWorker: docs-nu-api/,
    );
  });
});

describe('workerIssueFiling', () => {
  it('files the issue under its title, reported by Workers Issues', () => {
    const issue: WorkerIssue = { trigger: 'recurrence', worker: 'w', error: 'E' };
    expect(workerIssueFiling(issue)).toEqual({
      title: 'w: E',
      reporter: { kind: 'workers-issues', id: null },
      issue,
    });
  });
});

describe('bugReportColumn', () => {
  const columns = [{ name: 'Reported' }, { name: 'security' }, { name: 'Fixed' }];
  const person: BugReportFiling = { title: 'T', reporter: { kind: 'anonymous', id: null } };
  const issue = (issueType: string): BugReportFiling => ({
    ...workerIssueFiling({ trigger: 'first_sight', issueType }),
  });

  it('files a security issue in the Security column, case apart', () => {
    expect(bugReportColumn(issue('security'), columns)).toBe(columns[1]);
  });

  it('files a security issue in the first column of a board without one', () => {
    expect(bugReportColumn(issue('security'), [columns[0]!, columns[2]!])).toBe(columns[0]);
  });

  it('files any other issue and a person’s report in the first column', () => {
    expect(bugReportColumn(issue('exception'), columns)).toBe(columns[0]);
    expect(bugReportColumn(person, columns)).toBe(columns[0]);
  });

  it('answers undefined for a board without columns', () => {
    expect(bugReportColumn(person, [])).toBeUndefined();
  });
});
