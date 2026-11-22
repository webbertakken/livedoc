import { beforeEach, describe, expect, it } from 'vitest';
import { listItems } from '../db';
import { listDueBugReports } from '../db/bug-reports';
import { seedBugTracker } from '../bug-reports/test-bug-tracker';
import { runBugReportRefile } from '../bug-reports/refile';
import { makeTestRouteContext } from '../routes/test-route-context';
import { sqliteD1, type SqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import {
  WORKER_ISSUES_BODY_MAX_BYTES,
  WORKER_ISSUES_EMAILS_PER_HOUR,
  WORKER_ISSUES_HELD_MAX,
} from './constants';
import { refileHeldWorkerIssues } from './held-refile';
import type { WorkerIssuesLedger } from './ledger';
import { handleWorkerIssues } from './route';
import { sampleDelivery } from './test-delivery';
import { ledgerBinding, testLedger } from './test-ledger';

// docs/specs/016-platform/worker-issues.md: "The receiver" (every row of its outcome table), "Once only", "The issue
// card", "Filing, storing and holding", "The email" and "During an outage".

const SECRET = 'whsec-test-1';
const OPERATOR = 'webber@docs.nu';

let db: SqliteD1;
let ledger: WorkerIssuesLedger;
let sent: { to: string; subject: string; html: string }[];
let d1Down: boolean;
let ledgerDown: boolean;
let limited: { key: string }[];
let limiterAnswer: 'allow' | 'deny' | 'throw';

// D1 behind a switch: while it is down every query throws, as an outage's `D1_ERROR` does.
function switchableDb(real: D1Database): D1Database {
  return new Proxy(real, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (d1Down) throw new Error('D1_ERROR: storage unavailable');
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

beforeEach(() => {
  db = sqliteD1();
  seedBugTracker(db);
  db.sql
    .prepare(
      `INSERT INTO email_lifecycle (owner_id, email, created_at) VALUES ('acct_webber', ?, 1)`,
    )
    .run(OPERATOR);
  sent = [];
  d1Down = false;
  ledgerDown = false;
  limited = [];
  limiterAnswer = 'allow';
  ledger = testLedger().ledger;
  Object.assign(db.env, {
    DB: switchableDb(db.env.DB),
    WORKER_ISSUES_WEBHOOK_SECRET: SECRET,
    WORKER_ISSUES_LEDGER: ledgerBinding(ledger, { down: () => ledgerDown }),
    WORKER_ISSUES_RATE_LIMITER: {
      limit: async (input: { key: string }) => {
        limited.push(input);
        if (limiterAnswer === 'throw') throw new Error('limiter down');
        return { success: limiterAnswer === 'allow' };
      },
    },
    EMAIL: {
      send: async (message: Record<string, unknown>) => {
        sent.push(message as (typeof sent)[number]);
        return { messageId: 'm' };
      },
    },
    BUG_REPORT_DOCUMENT_ID: 'tracker',
    BUG_REPORT_TAB_ID: 'board',
    APP_BASE_URL: 'https://docs.nu',
  } satisfies Partial<Env>);
});

async function post(
  body: unknown,
  opts: {
    secret?: string | null;
    method?: string;
    rawBody?: string;
    headers?: Record<string, string>;
    path?: string;
  } = {},
) {
  const pending: Promise<unknown>[] = [];
  const secret = opts.secret === undefined ? SECRET : opts.secret;
  const ctx = makeTestRouteContext(opts.method ?? 'POST', opts.path ?? '/api/worker-issues', {
    env: db.env,
    owner: null,
    ...(opts.rawBody !== undefined
      ? { rawBody: opts.rawBody }
      : body === undefined
        ? {}
        : { body }),
    headers: {
      'CF-Connecting-IP': '198.51.100.7',
      ...(secret === null ? {} : { 'cf-webhook-auth': secret }),
      ...opts.headers,
    },
    waitUntil: (p) => void pending.push(p),
  });
  const res = await handleWorkerIssues(ctx);
  await Promise.all(pending);
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    body: text ? (JSON.parse(text) as unknown) : null,
  };
}

const storedRows = () =>
  db.sql.prepare('SELECT reporter_kind, reason, title FROM bug_reports').all();
const cards = () => listItems(db.env, 'tracker');

describe('POST /api/worker-issues, the receiver', () => {
  it('files a first sight as an issue card and emails the operator once', async () => {
    expect(await post(sampleDelivery())).toEqual({
      status: 201,
      headers: expect.anything(),
      body: { outcome: 'filed', number: 1 },
    });
    const [card] = await cards();
    expect(card?.fields).toMatchObject({
      title: 'docs-nu-api: TypeError: boom',
      status: 'reported',
      labels: ['Worker Issue', 'docs-nu-api'],
      'f-rep': 'Workers Issues',
    });
    expect(card?.fields['description']).toContain('Worker: docs-nu-api\nTrigger: First sight');
    expect(card?.fields['description']).toContain('Stack:\nTypeError: boom');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: OPERATOR,
      subject: 'New error in docs-nu-api: TypeError: boom',
    });
    expect(sent[0]?.html).toContain('#1 on the Bug Tracker');
  });

  it('files and emails a recurrence too', async () => {
    await post(sampleDelivery());
    const back = await post(
      sampleDelivery({ runId: 'run_2', trigger: 'recurrence_after_inactivity' }),
    );
    expect(back.body).toEqual({ outcome: 'filed', number: 2 });
    expect(sent.map((m) => m.subject)).toEqual([
      'New error in docs-nu-api: TypeError: boom',
      'Error back in docs-nu-api: TypeError: boom',
    ]);
  });

  it('files nothing and sends nothing for a repeated delivery', async () => {
    await post(sampleDelivery());
    expect(await post(sampleDelivery())).toMatchObject({
      status: 200,
      body: { outcome: 'repeat' },
    });
    expect(await cards()).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('tells a resent notification without a run by its body', async () => {
    const noRun = (ts: number) => {
      const d = sampleDelivery({ ts });
      const { run: _run, ...data } = d.data;
      return { ...d, data };
    };
    await post(noRun(1));
    expect((await post(noRun(2))).body).toEqual({ outcome: 'repeat' });
    expect(await cards()).toHaveLength(1);
  });

  it('answers the destination test with nothing filed or sent', async () => {
    expect(await post({ text: 'Hello World! This is a test message.' })).toMatchObject({
      status: 200,
      body: { outcome: 'test' },
    });
    expect(await cards()).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('stores a card the board cannot take, and the refile files it as a bug report', async () => {
    db.sql.exec(`UPDATE document SET item_types = '{"version":1,"types":[]}' WHERE id = 'tracker'`);
    expect(await post(sampleDelivery())).toMatchObject({
      status: 202,
      body: { outcome: 'stored' },
    });
    expect(storedRows()).toEqual([
      {
        reporter_kind: 'workers-issues',
        reason: 'type_missing',
        title: 'docs-nu-api: TypeError: boom',
      },
    ]);
    expect(sent[0]?.html).toContain('Waiting to be filed on the Bug Tracker');
  });
});

describe('POST /api/worker-issues, refused by name', () => {
  it('answers as an unknown route, whatever the method, when no secret is set', async () => {
    for (const secret of [undefined, '', '   ']) {
      db.env.WORKER_ISSUES_WEBHOOK_SECRET = secret;
      for (const method of ['POST', 'GET', 'PUT']) {
        const res = await post(method === 'GET' ? undefined : sampleDelivery(), { method });
        expect(res).toMatchObject({ status: 404, body: { error: 'not_found' } });
      }
    }
    expect(await cards()).toEqual([]);
    expect(storedRows()).toEqual([]);
    expect(sent).toEqual([]);
    expect(limited).toEqual([]);
    expect(ledger.claim('run:run_1', Date.now())).toBe('new');
  });

  it('answers an unknown route below it', async () => {
    expect(await post(sampleDelivery(), { path: '/api/worker-issues/x' })).toMatchObject({
      status: 404,
    });
  });

  it('refuses a wrong method', async () => {
    expect(await post(undefined, { method: 'GET' })).toMatchObject({
      status: 405,
      body: { error: 'method_not_allowed' },
    });
  });

  it('throttles per network, before the secret is checked', async () => {
    limiterAnswer = 'deny';
    const res = await post(sampleDelivery(), { secret: null });
    expect(res).toMatchObject({ status: 429, body: { error: 'rate_limited' } });
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(limited).toEqual([{ key: 'worker-issues:198.51.100.0/24' }]);
  });

  it('lets a delivery through when the limiter fails or is absent', async () => {
    limiterAnswer = 'throw';
    expect((await post(sampleDelivery())).status).toBe(201);
    db.env.WORKER_ISSUES_RATE_LIMITER = undefined;
    expect((await post(sampleDelivery({ runId: 'run_2' }))).status).toBe(201);
  });

  it.each([
    ['unsigned', null],
    ['signed with the wrong secret', 'whsec-test-2'],
    ['signed with an empty secret', ''],
  ])('refuses a delivery %s, filing nothing', async (_label, secret) => {
    expect(await post(sampleDelivery(), { secret })).toMatchObject({
      status: 401,
      body: { error: 'unauthorized' },
    });
    expect(await cards()).toEqual([]);
  });

  it('refuses a body over the bound, declared or read', async () => {
    const big = JSON.stringify({ text: 'x'.repeat(WORKER_ISSUES_BODY_MAX_BYTES) });
    expect(
      await post(undefined, {
        rawBody: '{}',
        headers: { 'content-length': String(WORKER_ISSUES_BODY_MAX_BYTES + 1) },
      }),
    ).toMatchObject({ status: 413, body: { error: 'payload_too_large' } });
    expect(await post(undefined, { rawBody: big })).toMatchObject({
      status: 413,
      body: { error: 'payload_too_large' },
    });
  });

  it('refuses a body that is not JSON, without echoing it', async () => {
    expect(await post(undefined, { rawBody: '{"text": <script>' })).toEqual({
      status: 400,
      headers: expect.anything(),
      body: { error: 'invalid_json' },
    });
  });

  it.each([[[1, 2]], ['text'], [{ name: 'n' }]])('refuses %j as an unknown shape', async (body) => {
    expect(await post(body)).toEqual({
      status: 400,
      headers: expect.anything(),
      body: { error: 'unknown_shape' },
    });
  });
});

describe('POST /api/worker-issues, during an outage', () => {
  it('holds the card while D1 is down, still emails the remembered operator, and refiles it after', async () => {
    await post(sampleDelivery({ runId: 'run_warm' }));
    d1Down = true;
    expect(await post(sampleDelivery({ runId: 'run_down' }))).toMatchObject({
      status: 202,
      body: { outcome: 'held' },
    });
    expect(sent.map((m) => m.to)).toEqual([OPERATOR, OPERATOR]);
    expect(sent[1]?.html).toContain('Waiting to be filed on the Bug Tracker');
    expect((await post(sampleDelivery({ runId: 'run_down' }))).body).toEqual({ outcome: 'repeat' });

    d1Down = false;
    expect(await refileHeldWorkerIssues(db.env, Date.now())).toEqual({
      held: 1,
      filed: 1,
      stored: 0,
      kept: 0,
    });
    expect((await cards()).map((c) => c.fields['title'])).toEqual([
      'docs-nu-api: TypeError: boom',
      'docs-nu-api: TypeError: boom',
    ]);
    expect(await refileHeldWorkerIssues(db.env, Date.now())).toEqual({
      held: 0,
      filed: 0,
      stored: 0,
      kept: 0,
    });
  });

  it('keeps a held card held while D1 is still down at the refile', async () => {
    d1Down = true;
    await post(sampleDelivery());
    expect(await refileHeldWorkerIssues(db.env, 1)).toEqual({
      held: 1,
      filed: 0,
      stored: 0,
      kept: 1,
    });
    d1Down = false;
    expect(await refileHeldWorkerIssues(db.env, 2)).toEqual({
      held: 1,
      filed: 1,
      stored: 0,
      kept: 0,
    });
  });

  it('stores a held card the board still cannot take', async () => {
    d1Down = true;
    await post(sampleDelivery());
    d1Down = false;
    db.env.BUG_REPORT_DOCUMENT_ID = undefined;
    expect(await refileHeldWorkerIssues(db.env, 1)).toEqual({
      held: 1,
      filed: 0,
      stored: 1,
      kept: 0,
    });
    expect(storedRows()).toEqual([
      {
        reporter_kind: 'workers-issues',
        reason: 'unconfigured',
        title: 'docs-nu-api: TypeError: boom',
      },
    ]);
    db.env.BUG_REPORT_DOCUMENT_ID = 'tracker';
    expect(await runBugReportRefile(db.env, 2)).toEqual({ due: 1, filed: 1, stored: 0 });
    expect((await cards())[0]?.fields['labels']).toEqual(['Worker Issue', 'docs-nu-api']);
    expect(await listDueBugReports(db.env, 5)).toEqual([]);
  });

  it('sends no email during an outage before the operator was ever read', async () => {
    d1Down = true;
    expect((await post(sampleDelivery())).body).toEqual({ outcome: 'held' });
    expect(sent).toEqual([]);
  });

  it('files and emails unguarded when the ledger is down', async () => {
    ledgerDown = true;
    expect((await post(sampleDelivery())).status).toBe(201);
    expect((await post(sampleDelivery())).status).toBe(201);
    expect(await cards()).toHaveLength(2);
    expect(sent).toHaveLength(2);
  });

  it('answers 503 and gives the key back when the card can go nowhere', async () => {
    for (let i = 0; i < WORKER_ISSUES_HELD_MAX; i += 1)
      ledger.hold(`k${i}`, { trigger: 'unknown' }, i);
    d1Down = true;
    expect(await post(sampleDelivery())).toEqual({
      status: 503,
      headers: expect.anything(),
      body: { error: 'worker_issues_unavailable' },
    });
    expect(ledger.claim('run:run_1', Date.now())).toBe('new');
  });

  it('answers 503 when D1 and the ledger are both down', async () => {
    d1Down = true;
    ledgerDown = true;
    expect((await post(sampleDelivery())).status).toBe(503);
    expect(sent).toEqual([]);
  });
});

describe('POST /api/worker-issues, without a ledger', () => {
  it('files and emails, unguarded, on a host whose worker has no ledger binding', async () => {
    db.env.WORKER_ISSUES_LEDGER = undefined;
    expect((await post(sampleDelivery())).status).toBe(201);
    expect((await post(sampleDelivery())).status).toBe(201);
    expect(sent).toHaveLength(2);
    expect(await refileHeldWorkerIssues(db.env, 1)).toEqual({
      held: 0,
      filed: 0,
      stored: 0,
      kept: 0,
    });
  });

  it('refiles nothing while the ledger is down', async () => {
    ledgerDown = true;
    expect(await refileHeldWorkerIssues(db.env, 1)).toEqual({
      held: 0,
      filed: 0,
      stored: 0,
      kept: 0,
    });
  });
});

describe('POST /api/worker-issues, the email', () => {
  it('still files when the email fails to send', async () => {
    db.env.EMAIL = { send: () => Promise.reject(new Error('provider down')) };
    expect((await post(sampleDelivery())).body).toEqual({ outcome: 'filed', number: 1 });
  });

  it('sends the email before answering where there is no waitUntil', async () => {
    const ctx = makeTestRouteContext('POST', '/api/worker-issues', {
      env: db.env,
      owner: null,
      body: sampleDelivery(),
      headers: { 'cf-webhook-auth': SECRET },
    });
    expect((await handleWorkerIssues(ctx)).status).toBe(201);
    expect(sent).toHaveLength(1);
  });

  it('sends none without a Bug Tracker, whose card is stored as unconfigured', async () => {
    db.env.BUG_REPORT_DOCUMENT_ID = undefined;
    expect((await post(sampleDelivery())).body).toEqual({ outcome: 'stored' });
    expect(storedRows()).toMatchObject([{ reason: 'unconfigured' }]);
    expect(sent).toEqual([]);
  });

  it('sends none where email is off, and still files', async () => {
    db.env.EMAIL = undefined;
    expect((await post(sampleDelivery())).status).toBe(201);
    expect(sent).toEqual([]);
  });

  it('sends at most the hour share, filing every card', async () => {
    for (let i = 0; i <= WORKER_ISSUES_EMAILS_PER_HOUR; i += 1)
      await post(sampleDelivery({ runId: `run_${i}` }));
    expect(await cards()).toHaveLength(WORKER_ISSUES_EMAILS_PER_HOUR + 1);
    expect(sent).toHaveLength(WORKER_ISSUES_EMAILS_PER_HOUR);
  });

  it('never puts the stack in the email', async () => {
    await post(sampleDelivery());
    expect(sent[0]?.html).not.toContain('src/home/route.ts');
  });
});
