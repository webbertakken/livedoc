// POST /api/worker-issues (docs/specs/016-platform/worker-issues.md "The receiver"): a Workers Issues automation's
// webhook. Off without its secret (answering as an unknown route), throttled per network, authenticated by the secret
// Cloudflare sends, bounded, read tolerantly; then once only, filed through the bug report pipeline (stored, else held
// in the ledger), and emailed to the operator. A refusal answers its code alone; nothing of a payload is echoed.
import { workerIssueFiling, type WorkerIssue } from '@livedoc/api-schema';
import { timingSafeEqual } from '../auth/timing-safe';
import { fileBugReport } from '../bug-reports/file';
import type { BugReportFileOutcome } from '../bug-reports/room-file';
import { clientIp, clientNetwork } from '../client-ip';
import { storeBugReport } from '../db/bug-reports';
import { json, methodNotAllowed, notFound } from '../responses';
import type { RouteContext } from '../routes/context';
import type { Env } from '../types';
import { WORKER_ISSUES_BODY_MAX_BYTES, WORKER_ISSUES_RETRY_AFTER_SECONDS } from './constants';
import { deliveryKey } from './delivery-key';
import { ledgerCall, workerIssuesLedger, type LedgerStub } from './ledger-client';
import { emailOperator } from './operator-email';
import { readWorkerIssuePayload } from './payload';

export const WORKER_ISSUES_AUTH_HEADER = 'cf-webhook-auth';

type Problem =
  'method' | 'throttled' | 'unauthorized' | 'too_large' | 'invalid_json' | 'unknown_shape';

function refuse(problem: Problem, response: Response): Response {
  console.info('[worker-issues] delivery.refused', { problem });
  return response;
}

const refusal = (status: number, error: string, headers?: HeadersInit) =>
  json({ error }, { status, ...(headers ? { headers } : {}) });

// The secret, or null for a host that has not turned the receiver on (blank counts as unset).
const secretOf = (env: Env) => env.WORKER_ISSUES_WEBHOOK_SECRET?.trim() || null;

async function throttled(ctx: RouteContext): Promise<boolean> {
  const limiter = ctx.env.WORKER_ISSUES_RATE_LIMITER;
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({
      key: `worker-issues:${clientNetwork(clientIp(ctx.request))}`,
    });
    return !success;
  } catch (error) {
    console.error('[worker-issues] limiter.failed', { why: String(error).slice(0, 200) });
    return false;
  }
}

// The body as text, or null when it is over the bound, declared or read.
async function boundedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > WORKER_ISSUES_BODY_MAX_BYTES) return null;
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > WORKER_ISSUES_BODY_MAX_BYTES) return null;
  return new TextDecoder().decode(bytes);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

type CardOutcome =
  { kind: 'filed'; number: number } | { kind: 'stored' } | { kind: 'held' } | { kind: 'lost' };

// docs/specs/016-platform/worker-issues.md "Filing, storing and holding": the board, else D1, else the ledger.
async function fileIssue(
  env: Env,
  ledger: LedgerStub | null,
  key: string,
  issue: WorkerIssue,
  now: number,
): Promise<CardOutcome> {
  const filing = workerIssueFiling(issue);
  let outcome: BugReportFileOutcome;
  try {
    outcome = await fileBugReport(env, filing);
  } catch (error) {
    console.error('[worker-issues] card.unfiled', { why: String(error).slice(0, 200) });
    outcome = { filed: false, reason: 'room_unavailable' };
  }
  if (outcome.filed) {
    console.info('[worker-issues] card.filed', { number: outcome.number });
    return { kind: 'filed', number: outcome.number };
  }
  try {
    await storeBugReport(env, { filing, screenshotKey: null, reason: outcome.reason }, now);
    console.warn('[worker-issues] card.stored', { reason: outcome.reason });
    return { kind: 'stored' };
  } catch (error) {
    console.error('[worker-issues] card.unstored', { why: String(error).slice(0, 200) });
  }
  const held = await ledgerCall(ledger, 'hold', (l) => l.hold(key, issue, now));
  if (held) {
    console.warn('[worker-issues] card.held');
    return { kind: 'held' };
  }
  console.error('[worker-issues] card.lost', {
    why: held === false ? 'held_full' : 'ledger_unavailable',
  });
  return { kind: 'lost' };
}

function answer(card: CardOutcome): Response {
  switch (card.kind) {
    case 'filed':
      return json({ outcome: 'filed', number: card.number }, { status: 201 });
    case 'stored':
      return json({ outcome: 'stored' }, { status: 202 });
    case 'held':
      return json({ outcome: 'held' }, { status: 202 });
    case 'lost':
      return json({ error: 'worker_issues_unavailable' }, { status: 503 });
  }
}

export async function receiveWorkerIssue(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const secret = secretOf(env);
  if (!secret) {
    console.info('[worker-issues] delivery.off');
    return notFound();
  }
  if (request.method !== 'POST') return refuse('method', methodNotAllowed());
  if (await throttled(ctx))
    return refuse(
      'throttled',
      refusal(429, 'rate_limited', { 'Retry-After': String(WORKER_ISSUES_RETRY_AFTER_SECONDS) }),
    );
  const presented = request.headers.get(WORKER_ISSUES_AUTH_HEADER) ?? '';
  if (!(await timingSafeEqual(presented, secret)))
    return refuse('unauthorized', refusal(401, 'unauthorized'));
  const text = await boundedBody(request);
  if (text === null) return refuse('too_large', refusal(413, 'payload_too_large'));
  const parsed = parseJson(text);
  if (!parsed.ok) return refuse('invalid_json', refusal(400, 'invalid_json'));
  const payload = readWorkerIssuePayload(parsed.value);
  if (payload.kind === 'unknown_shape')
    return refuse('unknown_shape', refusal(400, 'unknown_shape'));
  if (payload.kind === 'test') {
    console.info('[worker-issues] delivery.test');
    return json({ outcome: 'test' });
  }

  const { issue, runId } = payload;
  const now = Date.now();
  const key = await deliveryKey(payload.payload, runId);
  console.info('[worker-issues] delivery.received', {
    worker: issue.worker ?? null,
    trigger: issue.trigger,
    issueId: issue.issueId ?? null,
    key: key.kind,
  });
  const ledger = workerIssuesLedger(env);
  if ((await ledgerCall(ledger, 'claim', (l) => l.claim(key.key, now))) === 'repeat') {
    console.info('[worker-issues] delivery.repeat', {
      issueId: issue.issueId ?? null,
      key: key.kind,
    });
    return json({ outcome: 'repeat' });
  }

  const card = await fileIssue(env, ledger, key.key, issue, now);
  if (card.kind === 'lost') await ledgerCall(ledger, 'release', (l) => l.release(key.key));
  const email = emailOperator(
    env,
    ledger,
    issue,
    card.kind === 'filed' ? { kind: 'filed', number: card.number } : { kind: 'waiting' },
    now,
  );
  if (ctx.waitUntil) ctx.waitUntil(email);
  else await email;
  return answer(card);
}
