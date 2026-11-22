// The held cards' refile (docs/specs/016-platform/worker-issues.md "Filing, storing and holding"): on the bug report
// refile's tick, the oldest cards the ledger held while D1 was down are filed, else stored in D1 with their reason,
// and let go. A card D1 still cannot take stays held for the next tick.
import { workerIssueFiling } from '@livedoc/api-schema';
import { fileBugReport } from '../bug-reports/file';
import type { BugReportFileOutcome } from '../bug-reports/room-file';
import { storeBugReport } from '../db/bug-reports';
import type { Env } from '../types';
import { WORKER_ISSUES_HELD_BATCH } from './constants';
import { ledgerCall, workerIssuesLedger } from './ledger-client';

export type HeldRefile = { held: number; filed: number; stored: number; kept: number };

export async function refileHeldWorkerIssues(env: Env, now: number): Promise<HeldRefile> {
  const ledger = workerIssuesLedger(env);
  if (!ledger) return { held: 0, filed: 0, stored: 0, kept: 0 };
  const held = (await ledgerCall(ledger, 'held', (l) => l.held(WORKER_ISSUES_HELD_BATCH))) ?? [];
  const result: HeldRefile = { held: held.length, filed: 0, stored: 0, kept: 0 };
  for (const { key, issue } of held) {
    const filing = workerIssueFiling(issue);
    let outcome: BugReportFileOutcome;
    try {
      outcome = await fileBugReport(env, filing);
    } catch {
      outcome = { filed: false, reason: 'room_unavailable' };
    }
    if (outcome.filed) {
      result.filed += 1;
      console.info('[worker-issues] card.filed', { number: outcome.number, held: true });
    } else {
      try {
        await storeBugReport(env, { filing, screenshotKey: null, reason: outcome.reason }, now);
        result.stored += 1;
      } catch {
        result.kept += 1;
        continue;
      }
    }
    await ledgerCall(ledger, 'drop_held', (l) => l.dropHeld(key));
  }
  if (held.length) console.info('[worker-issues] held.refiled', result);
  return result;
}
