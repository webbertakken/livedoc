import { describe, expect, it } from 'vitest';
import type { WorkerIssue } from '@livedoc/api-schema';
import {
  WORKER_ISSUES_EMAILS_PER_HOUR,
  WORKER_ISSUES_HELD_MAX,
  WORKER_ISSUES_KEY_TTL_MS,
} from './constants';
import { testLedger } from './test-ledger';

// docs/specs/016-platform/worker-issues.md "Once only", "Filing, storing and holding", "The email": the ledger.

const issue = (title: string): WorkerIssue => ({ trigger: 'first_sight', worker: 'w', title });

describe('WorkerIssuesLedger', () => {
  it('takes a key once, and calls it a repeat after', () => {
    const { ledger } = testLedger();
    expect(ledger.claim('run:1', 10)).toBe('new');
    expect(ledger.claim('run:1', 11)).toBe('repeat');
    expect(ledger.claim('run:2', 12)).toBe('new');
  });

  it('forgets a key after its days are up', () => {
    const { ledger } = testLedger();
    ledger.claim('run:1', 0);
    expect(ledger.claim('run:1', WORKER_ISSUES_KEY_TTL_MS + 1)).toBe('new');
  });

  it('gives a key back', () => {
    const { ledger } = testLedger();
    ledger.claim('run:1', 0);
    ledger.release('run:1');
    expect(ledger.claim('run:1', 1)).toBe('new');
  });

  it('keeps what it holds across a wake', () => {
    const { ledger, wake } = testLedger();
    ledger.claim('run:1', 0);
    expect(wake().claim('run:1', 1)).toBe('repeat');
  });

  it('holds cards oldest first, and lets them go', () => {
    const { ledger } = testLedger();
    expect(ledger.hold('k2', issue('second'), 2)).toBe(true);
    expect(ledger.hold('k1', issue('first'), 1)).toBe(true);
    expect(ledger.held(10)).toEqual([
      { key: 'k1', issue: issue('first') },
      { key: 'k2', issue: issue('second') },
    ]);
    expect(ledger.held(1)).toHaveLength(1);
    ledger.dropHeld('k1');
    expect(ledger.held(10).map((h) => h.key)).toEqual(['k2']);
  });

  it('holds no more than its bound', () => {
    const { ledger } = testLedger();
    for (let i = 0; i < WORKER_ISSUES_HELD_MAX; i += 1) ledger.hold(`k${i}`, issue('x'), i);
    expect(ledger.hold('one-more', issue('x'), 1_000)).toBe(false);
  });

  it('skips a held row it cannot read', () => {
    const { ledger, sql } = testLedger();
    ledger.hold('k1', issue('x'), 1);
    sql.exec(`UPDATE held SET issue = 'not json'`);
    expect(ledger.held(10)).toEqual([]);
  });

  it('remembers the operator, the newest address winning', () => {
    const { ledger } = testLedger();
    expect(ledger.operator()).toBeNull();
    ledger.rememberOperator('a@docs.nu', 1);
    ledger.rememberOperator('b@docs.nu', 2);
    expect(ledger.operator()).toBe('b@docs.nu');
  });

  it('counts emails an hour at a time', () => {
    const { ledger } = testLedger();
    for (let i = 0; i < WORKER_ISSUES_EMAILS_PER_HOUR; i += 1)
      expect(ledger.claimEmail(i)).toBe(true);
    expect(ledger.claimEmail(100)).toBe(false);
    expect(ledger.claimEmail(3_600_000 + 100)).toBe(true);
  });
});
