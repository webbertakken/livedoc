// The worker's way to the worker issues ledger (docs/specs/016-platform/worker-issues.md "During an outage"): its one
// instance, and every call made safe, so a ledger that cannot be reached is a logged gap, never a failed delivery.
import type { Env } from '../types';
import { WORKER_ISSUES_LEDGER_NAME } from './constants';
import type { WorkerIssuesLedger } from './ledger';

export type LedgerStub = DurableObjectStub<WorkerIssuesLedger>;

export function workerIssuesLedger(env: Env): LedgerStub | null {
  const binding = env.WORKER_ISSUES_LEDGER;
  return binding ? binding.get(binding.idFromName(WORKER_ISSUES_LEDGER_NAME)) : null;
}

// One ledger call, or undefined (logged with its step) when there is no ledger or it failed.
export async function ledgerCall<T>(
  ledger: LedgerStub | null,
  step: string,
  call: (ledger: LedgerStub) => Promise<T>,
): Promise<T | undefined> {
  if (!ledger) {
    console.warn('[worker-issues] ledger.unavailable', { step, why: 'unbound' });
    return undefined;
  }
  try {
    return await call(ledger);
  } catch (error) {
    console.error('[worker-issues] ledger.unavailable', { step, why: String(error).slice(0, 200) });
    return undefined;
  }
}
