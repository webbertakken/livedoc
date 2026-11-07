import { describe, expect, it, vi } from 'vitest';
import { DOCUMENT_ID_HEADER } from './document-client';
import { DocumentRoom } from './document-room';
import { roomSqlStorage } from '../test-document-room';
import { LEGACY_HANDOVER_KEY } from './legacy-handover';
import { RoomIdMismatchError } from './room-content';

// The first request a SQLite room answers takes over its legacy room's state
// (docs/specs/006-document/document-storage-move.md).

function makeState() {
  const store = new Map<string, unknown>();
  let gate: Promise<unknown> = Promise.resolve();
  const waits: Promise<unknown>[] = [];
  const sqlite = roomSqlStorage();
  const state = {
    store,
    waits,
    get gate() {
      return gate;
    },
    acceptWebSocket: () => {},
    getWebSockets: () => [],
    storage: {
      get: async (key: string) => store.get(key),
      put: async (key: string | Record<string, unknown>, value?: unknown) => {
        if (typeof key === 'string') store.set(key, value);
        else for (const [k, v] of Object.entries(key)) store.set(k, v);
      },
      delete: async (key: string) => store.delete(key),
      list: async ({ prefix }: { prefix: string }) =>
        new Map([...store].filter(([k]) => k.startsWith(prefix))),
      setAlarm: async () => {},
      deleteAlarm: async () => {},
      deleteAll: async () => store.clear(),
      kv: {
        get: (key: string) => store.get(key),
        put: (key: string, value: unknown) => store.set(key, value),
        delete: (key: string) => store.delete(key),
      },
      sql: sqlite.sql,
      transactionSync: sqlite.transactionSync,
    },
    blockConcurrencyWhile: (fn: () => Promise<unknown>) => {
      gate = gate.then(fn);
      return gate;
    },
    waitUntil: (p: Promise<unknown>) => waits.push(p),
  };
  return state;
}

function legacyRooms(entries: [string, unknown][], opts: { failFirst?: boolean } = {}) {
  let fails = opts.failFirst ? 1 : 0;
  const legacy = {
    asked: 0,
    cleared: false,
    named: [] as string[],
    exportState: vi.fn(async () => {
      legacy.asked++;
      if (fails-- > 0) throw new Error('legacy unreachable');
      return { entries, next: null };
    }),
    clear: vi.fn(async () => {
      legacy.cleared = true;
    }),
  };
  const ns = {
    idFromName: (name: string) => {
      legacy.named.push(name);
      return name;
    },
    get: () => legacy,
  };
  return { ns, legacy };
}

function room(entries: [string, unknown][], opts: { failFirst?: boolean } = {}) {
  const state = makeState();
  const { ns, legacy } = legacyRooms(entries, opts);
  const r = new DocumentRoom(
    state as unknown as DurableObjectState,
    {
      LEGACY_DOCUMENT_ROOM: ns,
      // D1 holds no row for the document, so the move gate moves nothing (G1).
      DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
    } as never,
  );
  const ask = async (headers: Record<string, string> = { [DOCUMENT_ID_HEADER]: 'doc-1' }) => {
    await state.gate;
    return r.fetch(new Request('https://room/ledger?tab=t1&epoch=x', { headers }));
  };
  return { r, state, legacy, ask };
}

describe('the room state handover', () => {
  it("takes the legacy room's order state, ledger and poll before answering", async () => {
    const { r, state, legacy, ask } = room([
      ['live-poll', { id: 'q', answers: [] }],
      ['order-state', { epoch: 'old-epoch', seq: 41 }],
    ]);
    const res = await ask();
    expect(res.status).not.toBe(503);
    expect(legacy.named).toEqual(['doc-1']);
    expect(r.epoch).toBe('old-epoch');
    expect(r.seq).toBe(41);
    expect(state.store.get('live-poll')).toEqual({ id: 'q', answers: [] });
    expect(state.store.get(LEGACY_HANDOVER_KEY)).toMatchObject({ keys: 2 });
    await Promise.all(state.waits);
    expect(legacy.cleared).toBe(true);
  });

  it('asks the legacy room once', async () => {
    const { legacy, ask } = room([['order-state', { epoch: 'e', seq: 1 }]]);
    await ask();
    await ask();
    expect(legacy.asked).toBe(1);
  });

  it('answers 503 when the legacy room fails, and takes it on the next request', async () => {
    const { r, legacy, ask } = room([['order-state', { epoch: 'kept', seq: 7 }]], {
      failFirst: true,
    });
    const first = await ask();
    expect(first.status).toBe(503);
    expect(first.headers.get('Retry-After')).toBe('5');
    await ask();
    expect(legacy.asked).toBe(2);
    expect(r.epoch).toBe('kept');
  });

  it('waits for a request that names its document', async () => {
    const { legacy, ask } = room([['order-state', { epoch: 'e', seq: 1 }]]);
    await ask({});
    expect(legacy.asked).toBe(0);
    await ask();
    expect(legacy.asked).toBe(1);
  });

  it('takes the legacy state before any RPC, keyed by the document the RPC names', async () => {
    const { r, state, legacy } = room([['order-state', { epoch: 'rpc-epoch', seq: 3 }]]);
    await state.gate;
    await r.hasTab('doc-1', 't1');
    expect(legacy.named).toEqual(['doc-1']);
    expect(r.epoch).toBe('rpc-epoch');
    expect(state.store.get(LEGACY_HANDOVER_KEY)).toMatchObject({ keys: 1 });
    await r.outline('doc-1');
    expect(legacy.asked).toBe(1);
  });

  it('refuses an RPC when the handover fails, and takes it on the next', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r, state, legacy } = room([['order-state', { epoch: 'e', seq: 1 }]], {
      failFirst: true,
    });
    await state.gate;
    await expect(r.hasTab('doc-1', 't1')).rejects.toThrow('room_unavailable');
    expect(error).toHaveBeenCalledWith(
      '[legacy-handover] failed id=doc-1 error=legacy unreachable',
    );
    await expect(r.hasTab('doc-1', 't1')).resolves.toBe(false);
    expect(legacy.asked).toBe(2);
    error.mockRestore();
  });

  it('checks the fetch header and the RPC against one bound id', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r, legacy, ask } = room([]);
    await ask();
    await expect(r.hasTab('doc-2', 't1')).rejects.toBeInstanceOf(RoomIdMismatchError);
    const res = await ask({ [DOCUMENT_ID_HEADER]: 'doc-3' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'room_id_mismatch' });
    expect(legacy.named).toEqual(['doc-1']);
    error.mockRestore();
  });

  it('binds before it hands over, so a wrong id never takes another legacy room', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { r, state, legacy } = room([['order-state', { epoch: 'e', seq: 1 }]]);
    await state.gate;
    await r.hasTab('doc-1', 't1');
    await expect(r.outline('doc-2')).rejects.toBeInstanceOf(RoomIdMismatchError);
    expect(legacy.named).toEqual(['doc-1']);
    error.mockRestore();
  });
});
