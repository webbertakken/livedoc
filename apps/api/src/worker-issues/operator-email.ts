// The worker issue email's way to the operator (docs/specs/016-platform/worker-issues.md "The email"): the Bug
// Tracker's owner's address, read from D1 and remembered by the ledger, so it still goes while D1 is down; at most
// the hour's share; best-effort through the email client.
import type { WorkerIssue } from '@livedoc/api-schema';
import { getDocument, getOwnerEmail } from '../db';
import { emailEnabled, sendEmail } from '../email/client';
import { workerIssueEmail, type WorkerIssueCardState } from '../email/worker-issue-email';
import type { Env } from '../types';
import { ledgerCall, type LedgerStub } from './ledger-client';

// The operator's address: D1 first (remembered on success), the ledger's when D1 cannot be read, null for a host
// with no Bug Tracker or an owner without one.
export async function operatorAddress(
  env: Env,
  ledger: LedgerStub | null,
  now: number,
): Promise<string | null> {
  const trackerId = env.BUG_REPORT_DOCUMENT_ID;
  if (!trackerId) return null;
  try {
    const tracker = await getDocument(env, trackerId);
    const address = tracker ? await getOwnerEmail(env, tracker.ownerId) : null;
    if (address)
      await ledgerCall(ledger, 'remember_operator', (l) => l.rememberOperator(address, now));
    return address;
  } catch {
    console.warn('[worker-issues] operator.remembered', { why: 'database_unavailable' });
    return (await ledgerCall(ledger, 'operator', (l) => l.operator())) ?? null;
  }
}

export async function emailOperator(
  env: Env,
  ledger: LedgerStub | null,
  issue: WorkerIssue,
  card: WorkerIssueCardState,
  now: number,
): Promise<void> {
  if (!emailEnabled(env)) {
    console.info('[worker-issues] email.off');
    return;
  }
  const to = await operatorAddress(env, ledger, now);
  if (!to) {
    console.warn('[worker-issues] email.no_operator');
    return;
  }
  if ((await ledgerCall(ledger, 'claim_email', (l) => l.claimEmail(now))) === false) {
    console.warn('[worker-issues] email.capped');
    return;
  }
  const { sent } = await sendEmail(env, {
    to,
    ...workerIssueEmail(env, issue, card, env.BUG_REPORT_DOCUMENT_ID || null),
  });
  if (sent) console.info('[worker-issues] email.sent', { trigger: issue.trigger });
  else console.error('[worker-issues] email.failed', { trigger: issue.trigger });
}
