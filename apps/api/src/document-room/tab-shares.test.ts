import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NETWORK_T0,
  ownerIdentity,
  roomNetwork,
  tabSeed,
  type RoomNetwork,
} from '../test-room-network';
import { nodeDocumentSql, nodeTransaction } from '../test-document-sql';
import type { DocumentEnv } from '../types';
import { DocumentDb } from './document-db';
import { PUSH_CONCURRENCY } from './document-outbox';
import { migrateDocumentSchema } from './document-schema';
import { FLUSH_IDLE_MS, FLUSH_RETRY_MS } from './room-content';
import { drainShares, isLaterWrite, SHARE_DRAIN_MAX, type ShareMessage } from './tab-shares';

// Shared tabs between rooms (docs/specs/006-document/tab-document-many-to-many.md "Keeping the copies in step",
// docs/specs/006-document/document-storage.md): each holder keeps its own copy
// under the same tab id, writes travel on the room's alarm, the later write wins everywhere, nothing echoes back.

const T0 = NETWORK_T0;

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  info = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function network(ids = ['A', 'B', 'C']): Promise<RoomNetwork> {
  const net = roomNetwork(ids);
  await net.room('A').room.create('A', tabSeed([{ id: 't', name: 'Glossary', label: 'v1' }]));
  for (const id of ids.slice(1)) {
    await net.room(id).room.create(id, tabSeed([{ id: `own-${id}` }]));
  }
  return net;
}

function call(net: RoomNetwork, id: string, method: string, path: string, body?: unknown) {
  const request = new Request(`https://api.test/api/documents/${id}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return net.room(id).room.route(id, request, ownerIdentity());
}

const link = (net: RoomNetwork, target: string, from: string, tab = 't') =>
  call(net, target, 'POST', `/tabs/${tab}/link`, { from });
const rename = (net: RoomNetwork, id: string, name: string, tab = 't') =>
  call(net, id, 'PUT', `/tabs/${tab}/name`, { name });

const holders = (net: RoomNetwork, id: string, tab = 't') =>
  (
    net
      .room(id)
      .sql.prepare('SELECT document_id FROM tab_shares WHERE tab_id = ? ORDER BY document_id')
      .all(tab) as { document_id: string }[]
  ).map((r) => r.document_id);
const owed = (net: RoomNetwork, id: string) =>
  (
    net
      .room(id)
      .sql.prepare('SELECT kind, tab_id, to_document, member FROM share_outbox ORDER BY id')
      .all() as { kind: string; tab_id: string; to_document: string; member: string }[]
  ).map((r) => `${r.kind}:${r.tab_id}>${r.to_document}${r.member ? `+${r.member}` : ''}`);
const tabOf = (net: RoomNetwork, id: string, tab = 't') =>
  net.room(id).sql.prepare('SELECT name, data, updated_at FROM tabs WHERE id = ?').get(tab) as
    { name: string; data: string; updated_at: number } | undefined;

// Every room's alarm that is due, until none is.
async function settle(net: RoomNetwork, ids: string[], at: number) {
  vi.setSystemTime(at);
  for (let round = 0; round < 5; round++) {
    for (const id of ids) {
      const due = net.room(id).alarms();
      if (due !== null && due <= at) await net.room(id).room.alarm();
    }
  }
}

describe('joining', () => {
  it('stores the copy under the same id, dated as the source, and each lists the other', async () => {
    const net = await network();
    const res = await link(net, 'B', 'A');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tab: { id: 't' } });
    expect(tabOf(net, 'B')).toEqual(tabOf(net, 'A'));
    expect(holders(net, 'A')).toEqual(['B']);
    expect(holders(net, 'B')).toEqual(['A']);
    // Unchanged since the copy: nothing is owed.
    expect(owed(net, 'A')).toEqual([]);
  });

  it('tells the other holders, and sends the joiner the tab again when it changed meanwhile', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    await link(net, 'C', 'A');
    expect(holders(net, 'A')).toEqual(['B', 'C']);
    expect(holders(net, 'C')).toEqual(['A', 'B']);
    expect(owed(net, 'A')).toEqual(['join:t>B+C']);
    await settle(net, ['A'], T0 + FLUSH_IDLE_MS);
    expect(holders(net, 'B')).toEqual(['A', 'C']);
  });
});

describe('a write', () => {
  it('reaches the other holder once the room is quiet, and is not echoed back', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    vi.setSystemTime(T0 + 1_000);
    expect((await rename(net, 'A', 'Terms')).status).toBe(200);
    expect(owed(net, 'A')).toEqual(['body:t>B']);
    expect(net.room('A').alarms()).toBeLessThanOrEqual(T0 + 1_000 + FLUSH_IDLE_MS);
    await settle(net, ['A', 'B'], T0 + 1_000 + FLUSH_IDLE_MS);
    expect(tabOf(net, 'B')).toMatchObject({ name: 'Terms', updated_at: T0 + 1_000 });
    expect(owed(net, 'A')).toEqual([]);
    expect(owed(net, 'B')).toEqual([]);
    expect(info).toHaveBeenCalledWith('[tab-shares] sent id=A to=B kind=body answer=ok');
  });

  it('a holder takes only a later write', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    const held = tabOf(net, 'B')!;
    const body = (updatedAt: number, name: string): ShareMessage => ({
      kind: 'body',
      tabId: 't',
      name,
      data: held.data,
      updatedAt,
      members: ['A'],
    });
    expect(await net.room('B').room.receiveShares('B', 'A', [body(T0 - 1, 'Older')])).toEqual([
      'ok',
    ]);
    expect(tabOf(net, 'B')!.name).toBe('Glossary');
    await net.room('B').room.receiveShares('B', 'A', [body(T0 + 5, 'Newer')]);
    expect(tabOf(net, 'B')).toMatchObject({ name: 'Newer', updated_at: T0 + 5 });
    // Taken in as a write: nothing is sent back to the sender.
    expect(owed(net, 'B')).toEqual([]);
  });

  it('two writes in the same millisecond settle on the larger SHA-256 in every holder', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    const at = T0 + 7;
    const dataA = JSON.stringify({ elements: [], note: 'from A' });
    const dataB = JSON.stringify({ elements: [], note: 'from B' });
    const message = (data: string): ShareMessage => ({
      kind: 'body',
      tabId: 't',
      name: 'Glossary',
      data,
      updatedAt: at,
      members: [],
    });
    await net.room('A').room.receiveShares('A', 'B', [message(dataA)]);
    await net.room('B').room.receiveShares('B', 'A', [message(dataB)]);
    const aFirst = tabOf(net, 'A')!.data;
    const bFirst = tabOf(net, 'B')!.data;
    // Each now sends its own to the other.
    await net.room('A').room.receiveShares('A', 'B', [message(bFirst)]);
    await net.room('B').room.receiveShares('B', 'A', [message(aFirst)]);
    const winner = (await isLaterWrite(
      { name: 'Glossary', data: dataA, updatedAt: at },
      { name: 'Glossary', data: dataB, updatedAt: at },
    ))
      ? dataA
      : dataB;
    expect(JSON.parse(tabOf(net, 'A')!.data)).toEqual(JSON.parse(winner));
    expect(JSON.parse(tabOf(net, 'B')!.data)).toEqual(JSON.parse(winner));
  });

  it('is sent on only to holders the sender did not list', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    await link(net, 'C', 'A');
    // B has not heard of C yet (A's join is still queued): B's write goes to A, which sends it on to C.
    vi.setSystemTime(T0 + 1_000);
    await rename(net, 'B', 'From B');
    expect(owed(net, 'B')).toEqual(['body:t>A']);
    await settle(net, ['B'], T0 + 1_000 + FLUSH_IDLE_MS);
    expect(tabOf(net, 'A')!.name).toBe('From B');
    expect(owed(net, 'A')).toEqual(['join:t>B+C', 'body:t>C']);
    await settle(net, ['A'], T0 + 2_000 + FLUSH_IDLE_MS);
    expect(tabOf(net, 'C')!.name).toBe('From B');
    expect(holders(net, 'B')).toEqual(['A', 'C']);
  });

  it('teaches a holder of a sender it did not list yet', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    await link(net, 'C', 'A');
    vi.setSystemTime(T0 + 1_000);
    await rename(net, 'C', 'From C');
    await settle(net, ['C'], T0 + 1_000 + FLUSH_IDLE_MS);
    expect(tabOf(net, 'B')!.name).toBe('From C');
    expect(holders(net, 'B')).toEqual(['A', 'C']);
  });

  it('retries a minute after a failed send', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const net = await network();
    await link(net, 'B', 'A');
    net.offline.add('B');
    await rename(net, 'A', 'Terms');
    await settle(net, ['A'], T0 + FLUSH_IDLE_MS);
    expect(owed(net, 'A')).toEqual(['body:t>B']);
    expect(net.room('A').alarms()).toBe(T0 + FLUSH_IDLE_MS + FLUSH_RETRY_MS);
    expect(warn).toHaveBeenCalledWith(
      '[tab-shares] send failed id=A to=B kind=body',
      expect.any(Error),
    );
    net.offline.delete('B');
    await settle(net, ['A'], T0 + FLUSH_IDLE_MS + FLUSH_RETRY_MS);
    expect(tabOf(net, 'B')!.name).toBe('Terms');
  });
});

describe('leaving', () => {
  it('a document removing the tab tells the others, which keep theirs', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    expect((await call(net, 'B', 'DELETE', '/tabs/t')).status).toBeLessThan(300);
    expect(owed(net, 'B')).toEqual(['leave:t>A']);
    await settle(net, ['B'], T0 + FLUSH_IDLE_MS);
    expect(holders(net, 'A')).toEqual([]);
    expect(tabOf(net, 'A')).toBeDefined();
    expect(tabOf(net, 'B')).toBeUndefined();
  });

  it('a holder that answers gone is dropped', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    // C never held `t`: a holder that missed its leave.
    net.room('A').sql.exec("INSERT INTO tab_shares (tab_id, document_id) VALUES ('t', 'C')");
    await rename(net, 'A', 'Terms');
    await settle(net, ['A'], T0 + FLUSH_IDLE_MS);
    expect(holders(net, 'A')).toEqual(['B']);
    expect(owed(net, 'A')).toEqual([]);
    expect(info).toHaveBeenCalledWith('[tab-shares] holder gone id=A tab=t holder=C');
  });

  it('a purged document tells each holder first', async () => {
    const net = await network();
    await link(net, 'B', 'A');
    await link(net, 'C', 'A');
    const res = await net.room('A').room.fetch(
      new Request('https://room.invalid/purge', {
        method: 'POST',
        headers: { 'X-Document-Id': 'A' },
      }),
    );
    expect(res.ok).toBe(true);
    expect(holders(net, 'B')).toEqual([]);
    expect(holders(net, 'C')).toEqual(['B']);
    expect(tabOf(net, 'B')).toBeDefined();
    const left = net
      .room('A')
      .sql.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();
    expect(left).toEqual([]);
  });
});

describe('the share drain', () => {
  function roomEnv(): { env: DocumentEnv; sql: DatabaseSync } {
    const sql = new DatabaseSync(':memory:');
    sql.exec('PRAGMA foreign_keys = ON');
    const exec = nodeDocumentSql(sql);
    migrateDocumentSchema((q) => exec.exec(q));
    const db = new DocumentDb(exec, {
      transaction: nodeTransaction(sql),
      ensureSchema: () => {},
      hasSchema: () => true,
      onWrite: () => {},
    });
    sql.exec(`INSERT INTO document (id, saved_at, created_at) VALUES ('A', 1, 1)`);
    sql.exec(
      `INSERT INTO tabs (id, name, data, updated_at) VALUES ('t', 'T', '{"elements":[]}', 1)`,
    );
    sql.exec(
      `INSERT INTO document_tabs (document_id, tab_id, order_index, added_at) VALUES ('A', 't', 0, 1)`,
    );
    return { env: { DOCUMENT_DB: db.asD1() } as unknown as DocumentEnv, sql };
  }

  it(`sends at most ${SHARE_DRAIN_MAX} a drain, ${PUSH_CONCURRENCY} at once, the body read once`, async () => {
    const { env, sql } = roomEnv();
    for (let i = 0; i < SHARE_DRAIN_MAX + 10; i++) {
      sql.exec(`INSERT INTO tab_shares (tab_id, document_id) VALUES ('t', 'H${i}')`);
    }
    sql.exec("UPDATE tabs SET name = 'T2' WHERE id = 't'");
    let inFlight = 0;
    let most = 0;
    const result = await drainShares(env, 'A', async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return ['ok'];
    });
    expect(result).toEqual({ sent: SHARE_DRAIN_MAX, failed: 0, gone: 0, more: true });
    expect(most).toBe(PUSH_CONCURRENCY);
    const left = sql.prepare('SELECT COUNT(*) AS n FROM share_outbox').get()!.n;
    expect(left).toBe(10);
  });

  it('keeps a key written again while it was in flight', async () => {
    const { env, sql } = roomEnv();
    sql.exec("INSERT INTO tab_shares (tab_id, document_id) VALUES ('t', 'B')");
    sql.exec("UPDATE tabs SET name = 'T2' WHERE id = 't'");
    const result = await drainShares(env, 'A', async () => {
      sql.exec("UPDATE tabs SET name = 'T3' WHERE id = 't'");
      return ['ok'];
    });
    expect(result.sent).toBe(1);
    expect(sql.prepare('SELECT COUNT(*) AS n FROM share_outbox').get()!.n).toBe(1);
  });

  it('drops a key whose tab went since', async () => {
    const { env, sql } = roomEnv();
    sql.exec(
      "INSERT INTO share_outbox (kind, tab_id, to_document) VALUES ('body', 'gone-tab', 'B')",
    );
    const send = vi.fn();
    const result = await drainShares(env, 'A', send);
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0, gone: 0, more: false });
    expect(sql.prepare('SELECT COUNT(*) AS n FROM share_outbox').get()!.n).toBe(0);
  });
});
