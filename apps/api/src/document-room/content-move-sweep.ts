// The sweep that moves every document's content into its room without waiting for someone to open it
// (docs/specs/006-document/document-storage-move.md "The sweep"). Each minute it asks the
// rooms of documents with no move record, and those whose failed try is an hour old, to move; a room that has moved
// answers its stored outcome and heals a lost record. Nothing to do: it returns at once, without a log line.

import type { Env } from '../types';
import { documentRoom } from './document-client';
import { failedMove, recordMove, type MoveOutcome } from './content-move';

/** Documents one sweep run asks to move. */
export const MOVE_SWEEP_BATCH = 25;
/** Moves in flight at once: Workers' open connections. */
export const MOVE_CONCURRENCY = 6;
/** How long the sweep waits on one room's move. */
export const MOVE_TIMEOUT_MS = 20_000;
/** A failed move is tried again at most once an hour. */
export const MOVE_RETRY_MS = 3_600_000;
/** The sweep's cron (wrangler.toml `triggers.crons`). */
export const CONTENT_MOVE_CRON = '* * * * *';

export type SweepResult = { found: number; moved: number; failed: number };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`move timeout after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function sweepContentMoves(
  env: Pick<Env, 'DB' | 'DOCUMENT_ROOM'>,
  now: number,
): Promise<SweepResult> {
  const due = await env.DB.prepare(
    `SELECT d.id FROM documents d LEFT JOIN content_moves m ON m.document_id = d.id
      WHERE m.status IS NULL OR (m.status <> 'moved' AND m.tried_at < ?1)
      ORDER BY m.document_id IS NOT NULL, d.created_at
      LIMIT ?2`,
  )
    .bind(now - MOVE_RETRY_MS, MOVE_SWEEP_BATCH)
    .all<{ id: string }>();
  const ids = (due.results ?? []).map((r) => r.id);
  if (ids.length === 0) return { found: 0, moved: 0, failed: 0 };
  const outcomes: (MoveOutcome | null | 'threw')[] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]!;
      try {
        outcomes.push(await withTimeout(documentRoom(env, id).move(), MOVE_TIMEOUT_MS));
      } catch (error) {
        const name = error instanceof Error ? error.name : typeof error;
        console.error(`[content-move] failed id=${id} stage=sweep error=${name}`, error);
        // Recorded as failed, so the hourly retry applies rather than every run.
        await recordMove(env, id, failedMove(name), now, true);
        outcomes.push('threw');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MOVE_CONCURRENCY, ids.length) }, worker));
  const result = {
    found: ids.length,
    moved: outcomes.filter((o) => o !== 'threw' && o?.status === 'moved').length,
    failed: outcomes.filter((o) => o === 'threw' || (o !== null && o.status !== 'moved')).length,
  };
  console.log(
    `[content-move] sweep found=${result.found} moved=${result.moved} failed=${result.failed}`,
  );
  return result;
}
