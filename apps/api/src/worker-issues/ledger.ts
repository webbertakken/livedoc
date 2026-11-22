// The worker issues ledger (docs/specs/016-platform/worker-issues.md "Vocabulary", "Once only", "During an outage"):
// one SQLite-backed Durable Object holding what must outlive a D1 outage, which is when errors arrive. The delivery
// keys seen, the cards neither the board nor D1 could take, the operator's address and the emails sent this hour.
// One instance, so two copies of a delivery arriving together are told apart by its storage's single writer.
import { DurableObject } from 'cloudflare:workers';
import { parseWorkerIssue, type WorkerIssue } from '@livedoc/api-schema';
import type { Env } from '../types';
import {
  WORKER_ISSUES_EMAILS_PER_HOUR,
  WORKER_ISSUES_EMAIL_WINDOW_MS,
  WORKER_ISSUES_HELD_MAX,
  WORKER_ISSUES_KEY_TTL_MS,
} from './constants';

export type HeldWorkerIssue = { key: string; issue: WorkerIssue };

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS deliveries (key TEXT PRIMARY KEY, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS held (key TEXT PRIMARY KEY, issue TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS emails (at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS operator (id INTEGER PRIMARY KEY CHECK (id = 1), address TEXT NOT NULL, at INTEGER NOT NULL);
`;

function readIssue(raw: string): WorkerIssue | null {
  try {
    return parseWorkerIssue(JSON.parse(raw));
  } catch {
    return null;
  }
}

export class WorkerIssuesLedger extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(SCHEMA);
  }

  // A delivery key taken: `new` the first time, `repeat` while the key is kept.
  claim(key: string, now: number): 'new' | 'repeat' {
    this.sql.exec('DELETE FROM deliveries WHERE at < ?', now - WORKER_ISSUES_KEY_TTL_MS);
    const taken = this.sql
      .exec(
        'INSERT INTO deliveries (key, at) VALUES (?, ?) ON CONFLICT(key) DO NOTHING RETURNING key',
        key,
        now,
      )
      .toArray();
    return taken.length ? 'new' : 'repeat';
  }

  // A key given back, so the next hand-off of a delivery that was lost is not taken for a repeat.
  release(key: string): void {
    this.sql.exec('DELETE FROM deliveries WHERE key = ?', key);
  }

  // A card kept until D1 can take it: false when the ledger already holds its bound.
  hold(key: string, issue: WorkerIssue, now: number): boolean {
    const [row] = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM held').toArray();
    if ((row?.n ?? 0) >= WORKER_ISSUES_HELD_MAX) return false;
    this.sql.exec(
      'INSERT INTO held (key, issue, at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING',
      key,
      JSON.stringify(issue),
      now,
    );
    return true;
  }

  // The oldest held cards, at most `limit`; a row that no longer reads is left for `dropHeld` and skipped.
  held(limit: number): HeldWorkerIssue[] {
    const rows = this.sql
      .exec<{ key: string; issue: string }>(
        'SELECT key, issue FROM held ORDER BY at, key LIMIT ?',
        limit,
      )
      .toArray();
    const out: HeldWorkerIssue[] = [];
    for (const row of rows) {
      const issue = readIssue(row.issue);
      if (issue) out.push({ key: row.key, issue });
      else console.error('[worker-issues] held.unreadable', { key: row.key.slice(0, 5) });
    }
    return out;
  }

  dropHeld(key: string): void {
    this.sql.exec('DELETE FROM held WHERE key = ?', key);
  }

  rememberOperator(address: string, now: number): void {
    this.sql.exec(
      `INSERT INTO operator (id, address, at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET address = excluded.address, at = excluded.at`,
      address,
      now,
    );
  }

  operator(): string | null {
    const [row] = this.sql
      .exec<{ address: string }>('SELECT address FROM operator WHERE id = 1')
      .toArray();
    return row?.address ?? null;
  }

  // One email counted against the hour: false when the hour already sent its share.
  claimEmail(now: number): boolean {
    this.sql.exec('DELETE FROM emails WHERE at <= ?', now - WORKER_ISSUES_EMAIL_WINDOW_MS);
    const [row] = this.sql.exec<{ n: number }>('SELECT COUNT(*) AS n FROM emails').toArray();
    if ((row?.n ?? 0) >= WORKER_ISSUES_EMAILS_PER_HOUR) return false;
    this.sql.exec('INSERT INTO emails (at) VALUES (?)', now);
    return true;
  }
}
