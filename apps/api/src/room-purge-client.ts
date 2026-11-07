// Removing a document for good removes everything its room stored too (docs/specs/006-document/document-storage.md
// "Purging and copying"): its content and the collaboration ledger, which keeps the text of every
// comment, idea and answer. The D1 removal before it is the delete and leaves a tombstone (`room_purges`,
// db/document-removal.ts) per document; a room that confirms its purge clears its tombstone, one that cannot be
// reached keeps it, logged rather than failing the request, and the daily cron tries it again.
//
// Each room call is a subrequest of the invocation making it, so one invocation makes at most
// ROOM_PURGE_MAX_PER_RUN of them (a RoomCallBudget); ids past the budget keep their tombstones for the cron.

import { roomFetch } from './room-client';
import type { Env } from './types';

// The api never waits on one room longer than this.
export const ROOM_PURGE_TIMEOUT_MS = 3_000;
// Rooms purged at a time, so a long list is a steady trickle rather than one burst.
export const ROOM_PURGE_CONCURRENCY = 10;
// Room purges one invocation makes: well inside the 1,000 subrequests a Worker may make to Cloudflare services on
// the Free plan (10,000 on Paid), beside the D1 calls of the same run.
export const ROOM_PURGE_MAX_PER_RUN = 300;
// A tombstone the cron tried is tried again no sooner than this.
export const ROOM_PURGE_RETRY_MS = 3_600_000;

/** The room purges an invocation may still make; shared by every purge of one run. */
export type RoomCallBudget = { left: number };

export function roomCallBudget(calls = ROOM_PURGE_MAX_PER_RUN): RoomCallBudget {
  return { left: calls };
}

export type RoomPurgeOutcome = { rooms: number; unreached: number; deferred: number };

export async function purgeRooms(
  env: Env,
  documentIds: readonly string[],
  budget: RoomCallBudget = roomCallBudget(),
): Promise<RoomPurgeOutcome> {
  const now = Date.now();
  const asked = documentIds.slice(0, Math.max(0, budget.left));
  budget.left -= asked.length;
  const deferred = documentIds.length - asked.length;
  const reached: string[] = [];
  const unreached: string[] = [];
  for (let i = 0; i < asked.length; i += ROOM_PURGE_CONCURRENCY) {
    const batch = asked.slice(i, i + ROOM_PURGE_CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await roomFetch(env, id, '/purge', { method: 'POST' }, ROOM_PURGE_TIMEOUT_MS);
          if (!res.ok) throw new Error(`status ${res.status}`);
          reached.push(id);
        } catch (err) {
          console.warn('[room-purge] did not reach the room', {
            documentId: id,
            error: String(err),
          });
          unreached.push(id);
        }
      }),
    );
  }
  await settleTombstones(env, reached, unreached, now);
  if (documentIds.length > 0) {
    console.info('[room-purge] purged', {
      rooms: asked.length,
      unreached: unreached.length,
      deferred,
    });
  }
  return { rooms: asked.length, unreached: unreached.length, deferred };
}

// A confirmed purge clears its tombstone; an unreached room's counts the try. Best effort: a tombstone left by a
// failed write here only means one more purge of a room that already has nothing.
async function settleTombstones(
  env: Env,
  reached: string[],
  unreached: string[],
  now: number,
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  if (reached.length > 0) {
    statements.push(
      env.DB.prepare(
        'DELETE FROM room_purges WHERE document_id IN (SELECT value FROM json_each(?))',
      ).bind(JSON.stringify(reached)),
    );
  }
  if (unreached.length > 0) {
    statements.push(
      env.DB.prepare(
        `UPDATE room_purges SET attempts = attempts + 1, last_attempt_at = ?
          WHERE document_id IN (SELECT value FROM json_each(?))`,
      ).bind(now, JSON.stringify(unreached)),
    );
  }
  if (statements.length === 0) return;
  try {
    await env.DB.batch(statements);
  } catch (err) {
    console.error('[room-purge] tombstones not settled', {
      reached: reached.length,
      unreached: unreached.length,
      error: String(err),
    });
  }
}

// The daily cron's retry: the oldest tombstones not tried within ROOM_PURGE_RETRY_MS, as many as the budget allows.
export async function retryRoomPurges(
  env: Env,
  now: number,
  budget: RoomCallBudget = roomCallBudget(),
): Promise<RoomPurgeOutcome> {
  if (budget.left <= 0) return { rooms: 0, unreached: 0, deferred: 0 };
  const res = await env.DB.prepare(
    `SELECT document_id FROM room_purges
      WHERE last_attempt_at IS NULL OR last_attempt_at <= ?
      ORDER BY requested_at, document_id LIMIT ?`,
  )
    .bind(now - ROOM_PURGE_RETRY_MS, budget.left)
    .all<{ document_id: string }>();
  const ids = (res.results ?? []).map((r) => r.document_id);
  const outcome = await purgeRooms(env, ids, budget);
  console.info('[room-purge] retried', { rooms: outcome.rooms, unreached: outcome.unreached });
  return outcome;
}

/** Guard G3's read: whether the document's room still owes a purge. */
export const PURGE_OWED_SQL = 'SELECT 1 AS owed FROM room_purges WHERE document_id = ?';

// Guard G3: a document whose room still owes a purge cannot be opened; the worker answers 404 before the room.
export async function purgeOwed(env: Env, documentId: string): Promise<boolean> {
  const row = await env.DB.prepare(PURGE_OWED_SQL).bind(documentId).first<{ owed: number }>();
  return row !== null;
}
