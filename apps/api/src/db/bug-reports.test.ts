import { beforeEach, describe, expect, it } from 'vitest';
import { workerIssueFiling, type BugReportFiling, type WorkerIssue } from '@livedoc/api-schema';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import {
  BUG_REPORT_WINDOW_MAX,
  BUG_REPORT_WINDOW_MS,
  claimBugReportSlot,
  deleteBugReport,
  deleteOldBugReportWindows,
  listDueBugReports,
  noteBugReportAttempt,
  storeBugReport,
} from './bug-reports';

// docs/specs/016-platform/bug-reports.md "Filing": the stored reports and the 600 s window.

let db: SqliteD1;
beforeEach(() => {
  db = sqliteD1();
});

const filing = (extra: Partial<BugReportFiling> = {}): BugReportFiling => ({
  title: 'Save fails',
  details: 'Spins',
  context: {
    route: '/document',
    viewport: { width: 1, height: 1, pixelRatio: 1 },
    online: true,
    recentErrors: [],
  },
  screenshotUrl: 'https://docs.nu/report-a-bug/screenshot?key=k',
  reporter: { kind: 'guest', id: 'g-1' },
  ...extra,
});

describe('stored bug reports', () => {
  // docs/specs/016-platform/worker-issues.md "Filing, storing and holding": an issue card stored and read back.
  it('keeps a worker issue in its own column, reported by Workers Issues', async () => {
    const issue: WorkerIssue = {
      trigger: 'recurrence',
      worker: 'docs-nu-api',
      error: 'E',
      count: 3,
    };
    await storeBugReport(
      db.env,
      { filing: workerIssueFiling(issue), screenshotKey: null, reason: 'board_busy' },
      1,
    );
    const [row] = await listDueBugReports(db.env, 5);
    expect(row?.filing).toEqual(workerIssueFiling(issue));
    expect(db.sql.prepare('SELECT owner_id, reporter_kind FROM bug_reports').get()).toEqual({
      owner_id: null,
      reporter_kind: 'workers-issues',
    });
  });

  it('reads an issue row whose issue no longer parses as an anonymous report', async () => {
    const issue: WorkerIssue = { trigger: 'first_sight', error: 'E' };
    await storeBugReport(
      db.env,
      { filing: workerIssueFiling(issue), screenshotKey: null, reason: 'board_busy' },
      1,
    );
    db.sql.exec(`UPDATE bug_reports SET issue = 'nope'`);
    const [row] = await listDueBugReports(db.env, 5);
    expect(row?.filing).toEqual({ title: 'E', reporter: { kind: 'workers-issues', id: null } });
  });

  it('stores a filing and gives it back whole, oldest first', async () => {
    await storeBugReport(
      db.env,
      { filing: filing({ title: 'second' }), screenshotKey: null, reason: 'board_busy' },
      20,
    );
    await storeBugReport(
      db.env,
      { filing: filing(), screenshotKey: 'k', reason: 'unconfigured' },
      10,
    );
    const due = await listDueBugReports(db.env, 5);
    expect(due.map((r) => r.filing.title)).toEqual(['Save fails', 'second']);
    expect(due[0]).toMatchObject({
      filing: filing(),
      reason: 'unconfigured',
      attempts: 0,
      createdAt: 10,
    });
  });

  it('keeps an anonymous reporter as no owner', async () => {
    await storeBugReport(
      db.env,
      {
        filing: filing({
          reporter: { kind: 'anonymous', id: null },
          details: undefined,
          context: undefined,
          screenshotUrl: undefined,
        }),
        screenshotKey: null,
        reason: 'unconfigured',
      },
      1,
    );
    const [row] = await listDueBugReports(db.env, 5);
    expect(row?.filing).toEqual({ title: 'Save fails', reporter: { kind: 'anonymous', id: null } });
    expect(db.sql.prepare('SELECT owner_id FROM bug_reports').get()).toEqual({ owner_id: null });
  });

  it('notes a refused attempt and deletes a filed one', async () => {
    const id = await storeBugReport(
      db.env,
      { filing: filing(), screenshotKey: null, reason: 'unconfigured' },
      1,
    );
    await noteBugReportAttempt(db.env, id, 'type_missing', 5);
    expect((await listDueBugReports(db.env, 5))[0]).toMatchObject({
      reason: 'type_missing',
      attempts: 1,
    });
    await deleteBugReport(db.env, id);
    expect(await listDueBugReports(db.env, 5)).toEqual([]);
  });

  it('lists at most the batch', async () => {
    for (let i = 0; i < 3; i++)
      await storeBugReport(
        db.env,
        { filing: filing(), screenshotKey: null, reason: 'unconfigured' },
        i,
      );
    expect(await listDueBugReports(db.env, 2)).toHaveLength(2);
  });

  it('reads a row whose context no longer parses without it', async () => {
    const id = await storeBugReport(
      db.env,
      { filing: filing(), screenshotKey: null, reason: 'unconfigured' },
      1,
    );
    db.sql.prepare(`UPDATE bug_reports SET context = '{"route":5}' WHERE id = ?`).run(id);
    expect((await listDueBugReports(db.env, 5))[0]?.filing.context).toBeUndefined();
  });
});

describe('claimBugReportSlot', () => {
  it('allows five in the window, then answers when the window ends', async () => {
    for (let i = 0; i < BUG_REPORT_WINDOW_MAX; i++)
      expect(await claimBugReportSlot(db.env, 'v', 1000 + i)).toEqual({ allowed: true });
    expect(await claimBugReportSlot(db.env, 'v', 61_000)).toEqual({
      allowed: false,
      retryAfterSeconds: 540,
    });
  });

  it('counts each visitor apart', async () => {
    for (let i = 0; i < BUG_REPORT_WINDOW_MAX; i++) await claimBugReportSlot(db.env, 'a', 1000);
    expect(await claimBugReportSlot(db.env, 'b', 1000)).toEqual({ allowed: true });
  });

  it('starts a new window once the old one has passed', async () => {
    for (let i = 0; i <= BUG_REPORT_WINDOW_MAX; i++) await claimBugReportSlot(db.env, 'v', 1000);
    expect(await claimBugReportSlot(db.env, 'v', 1000 + BUG_REPORT_WINDOW_MS)).toEqual({
      allowed: true,
    });
  });

  it('sweeps windows older than the cut-off', async () => {
    await claimBugReportSlot(db.env, 'old', 1000);
    await claimBugReportSlot(db.env, 'new', 5000);
    expect(await deleteOldBugReportWindows(db.env, 2000)).toBe(1);
    expect(db.sql.prepare('SELECT visitor FROM bug_report_windows').all()).toEqual([
      { visitor: 'new' },
    ]);
  });
});
