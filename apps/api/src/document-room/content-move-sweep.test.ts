import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '../test-sqlite-d1';
import type { Env } from '../types';
import type { MoveOutcome } from './content-move';
import {
  CONTENT_MOVE_CRON,
  MOVE_CONCURRENCY,
  MOVE_RETRY_MS,
  MOVE_SWEEP_BATCH,
  sweepContentMoves,
} from './content-move-sweep';

// The sweep (docs/specs/006-document/document-storage-move.md "The sweep"): unrecorded documents first,
// oldest first, at most MOVE_SWEEP_BATCH a run, MOVE_CONCURRENCY at once, a failed one again after an hour, and
// nothing at all when nothing is due.

const NOW = 1_700_000_000_000;

const moved: MoveOutcome = {
  status: 'moved',
  d1Hash: 'h',
  roomHash: 'h',
  d1Tabs: 0,
  roomTabs: 0,
  born: false,
  movedAt: NOW,
  error: null,
};

function setup(answer: (id: string) => Promise<MoveOutcome | null> = async () => moved) {
  const d1 = sqliteD1({}, { keepD1Content: true });
  const asked: string[] = [];
  let inFlight = 0;
  let most = 0;
  const env = {
    ...d1.env,
    DOCUMENT_ROOM: {
      idFromName: (id: string) => id,
      get: (id: string) => ({
        move: async () => {
          asked.push(id);
          inFlight++;
          most = Math.max(most, inFlight);
          await new Promise((r) => setTimeout(r, 1));
          inFlight--;
          return answer(id);
        },
      }),
    },
  } as unknown as Env;
  const add = (id: string, createdAt: number) =>
    d1.sql
      .prepare(
        'INSERT INTO documents (id, owner_id, name, saved_at, created_at) VALUES (?, ?, ?, 1, ?)',
      )
      .run(id, 'o', id, createdAt);
  const recordAs = (id: string, status: string, triedAt: number) =>
    d1.sql
      .prepare('INSERT INTO content_moves (document_id, status, tried_at) VALUES (?, ?, ?)')
      .run(id, status, triedAt);
  return { d1, env, asked, add, recordAs, most: () => most };
}

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('sweepContentMoves', () => {
  it('asks unrecorded documents first, oldest first, then failed ones an hour old', async () => {
    const { env, asked, add, recordAs } = setup();
    add('old-failed', 1);
    add('new', 3);
    add('old', 2);
    add('recent-failed', 4);
    add('done', 5);
    recordAs('old-failed', 'failed', NOW - MOVE_RETRY_MS - 1);
    recordAs('recent-failed', 'mismatch', NOW - 1_000);
    recordAs('done', 'moved', 1);
    const result = await sweepContentMoves(env, NOW);
    expect(asked).toEqual(['old', 'new', 'old-failed']);
    expect(result).toEqual({ found: 3, moved: 3, failed: 0 });
    expect(log).toHaveBeenCalledWith('[content-move] sweep found=3 moved=3 failed=0');
  });

  it('asks at most MOVE_SWEEP_BATCH documents a run, MOVE_CONCURRENCY at once', async () => {
    const { env, asked, add, most } = setup();
    for (let i = 0; i < MOVE_SWEEP_BATCH + 5; i++) add(`d${String(i).padStart(2, '0')}`, i);
    await sweepContentMoves(env, NOW);
    expect(asked).toHaveLength(MOVE_SWEEP_BATCH);
    expect(most()).toBe(MOVE_CONCURRENCY);
  });

  it('counts failures, and records a room that threw so it waits an hour', async () => {
    const { d1, env, add } = setup(async (id) => {
      if (id === 'b') throw new Error('room down');
      return { ...moved, status: id === 'c' ? 'mismatch' : 'moved' };
    });
    add('a', 1);
    add('b', 2);
    add('c', 3);
    expect(await sweepContentMoves(env, NOW)).toEqual({ found: 3, moved: 1, failed: 2 });
    expect(
      d1.sql
        .prepare("SELECT status, tried_at, error FROM content_moves WHERE document_id = 'b'")
        .get(),
    ).toEqual({
      status: 'failed',
      tried_at: NOW,
      error: 'Error',
    });
    expect(await sweepContentMoves(env, NOW + 1_000)).toMatchObject({ found: 2 });
  });

  it('does nothing, and logs nothing, when nothing is due', async () => {
    const { env, asked, add, recordAs } = setup();
    add('done', 1);
    recordAs('done', 'moved', 1);
    expect(await sweepContentMoves(env, NOW)).toEqual({ found: 0, moved: 0, failed: 0 });
    expect(asked).toEqual([]);
    expect(log).not.toHaveBeenCalled();
  });
});

describe('the every-minute cron', () => {
  it('runs the sweep', async () => {
    const { default: worker } = await import('../index');
    const { env, asked, add } = setup();
    add('a', 1);
    const pending: Promise<unknown>[] = [];
    await worker.scheduled({ cron: CONTENT_MOVE_CRON, scheduledTime: NOW, noRetry() {} }, env, {
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    } as unknown as ExecutionContext);
    await Promise.all(pending);
    expect(asked).toEqual(['a']);
  });
});
