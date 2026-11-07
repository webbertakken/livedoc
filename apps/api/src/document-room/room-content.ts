// The content half of a document's room (docs/specs/006-document/document-storage.md,
// "The outbox"): its SQLite as `DOCUMENT_DB`, the env its handlers run with, the one document it answers for, and
// the outbox's drain on idle. DocumentRoom owns the sockets and the one alarm; it asks this for the drain's
// deadline and runs the drain when it is due.

import type { DocumentRoom } from './document-room';
import { markBorn, moveIntoRoom, storedMove, type MoveOutcome } from './content-move';
import { DocumentDb } from './document-db';
import { json } from '../responses';
import { RETRY_AFTER_S } from './document-route';
import { documentRoom } from './document-client';
import { drainOutbox, pooled, PUSH_CONCURRENCY } from './document-outbox';
import { documentRpc, type DocumentRoomRpc } from './document-rpc';
import { hasDocumentSchema, migrateDocumentSchema } from './document-schema';
import {
  maintainRoom,
  UPKEEP_AT_KEY,
  UPKEEP_DUE_KEY,
  UPKEEP_INTERVAL_MS,
  upkeepAfterWrite,
} from './room-upkeep';
import { allShares, drainShares } from './tab-shares';
import type { DocumentEnv, Env } from '../types';

// The drain's pace.
export const FLUSH_IDLE_MS = 2_000;
export const FLUSH_MIN_GAP_MS = 60_000;
export const FLUSH_RETRY_MS = 60_000;

// When the next drain may run after a write at `now`: once the room is quiet, and at most once a minute.
export function nextFlushAt(now: number, lastFlushAt: number): number {
  return Math.max(now + FLUSH_IDLE_MS, lastFlushAt + FLUSH_MIN_GAP_MS);
}

export class RoomIdMismatchError extends Error {
  constructor(held: string, asked: string) {
    super(`room_id_mismatch held=${held} asked=${asked}`);
    this.name = 'RoomIdMismatchError';
  }
}

// A room that cannot serve its document yet (its legacy handover or its move failed); the worker answers it as
// 503 `room_unavailable` or `content_moving`, and the next call tries again.
export class RoomNotReadyError extends Error {
  readonly step: 'handover' | 'move';
  constructor(documentId: string, step: 'handover' | 'move') {
    super(`room_unavailable id=${documentId} step=${step}`);
    this.name = 'RoomNotReadyError';
    this.step = step;
  }

  // The answer to a request that met it: 503, named for the step, retried after a few seconds.
  response(): Response {
    const error = this.step === 'move' ? 'content_moving' : 'room_unavailable';
    return json({ error }, { status: 503, headers: { 'Retry-After': String(RETRY_AFTER_S) } });
  }
}

type RoomState = Pick<DurableObjectState, 'storage' | 'id' | 'waitUntil' | 'blockConcurrencyWhile'>;

// What the room hands its content half: the one alarm, and the gate every RPC passes before it is answered (the
// legacy handover, then the move), after the room is bound to the RPC's document.
export type RoomContentHooks = {
  armAlarm: () => void;
  prepare: (documentId: string) => Promise<void>;
};

export class RoomContent {
  // The env the document's handlers run with here; undefined for a unit test's room built without bindings or
  // without SQLite storage.
  readonly env: DocumentEnv | undefined;
  private readonly state: RoomState;
  private readonly hooks: RoomContentHooks;
  private documentId: string | null = null;
  private db: DocumentDb | undefined;
  // Whether this instance knows its content is moved (the key-value record decides across instances).
  private moved = false;
  private schemaReady: boolean;
  // Whether this instance has run the schema steps (a wake after a release may find an older version).
  private migrated = false;
  private flushAt: number | null = null;
  // The next send to the other holders of its shared tabs (tab-shares.ts): on idle, not held to the D1 drain's once
  // a minute, since it is a call to another room rather than a D1 write.
  private shareAt: number | null = null;
  // The next upkeep (room-upkeep.ts), kept in the key-value store too so an evicted room still runs it.
  private upkeepAt: number | null = null;
  private lastFlushAt = 0;
  private draining = false;

  constructor(state: RoomState, env: Env | undefined, room: DocumentRoom, hooks: RoomContentHooks) {
    this.state = state;
    this.hooks = hooks;
    const sql = state.storage.sql as SqlStorage | undefined;
    this.schemaReady = sql ? hasDocumentSchema((q) => sql.exec(q)) : false;
    if (!env || !sql) {
      this.env = undefined;
      return;
    }
    // (`db` below is kept for the move, which writes through it inside its own transaction.)
    const db = new DocumentDb(sql, {
      transaction: (fn) => state.storage.transactionSync(fn),
      ensureSchema: () => this.ensureSchema(),
      hasSchema: () => this.schemaReady,
      onWrite: () => this.noteWrite(),
    });
    this.db = db;
    this.env = {
      ...env,
      DOCUMENT_DB: db.asD1(),
      DOCUMENT_ROOM: localNamespace(env.DOCUMENT_ROOM, state.id, room),
    };
    // After a wake: the document this room holds, and anything its outbox still owes D1.
    if (this.schemaReady) {
      const row = sql.exec('SELECT id FROM document LIMIT 1').toArray()[0];
      if (typeof row?.id === 'string') this.documentId = row.id;
      if (this.owesD1()) this.flushAt = Date.now();
      if (this.owesShares()) this.shareAt = Date.now();
      const due = state.storage.kv?.get(UPKEEP_DUE_KEY);
      if (typeof due === 'number') this.upkeepAt = due;
    }
  }

  // Every RPC names its document; a room answers for one only. A room that stores nothing yet adopts the id it is
  // first asked about (a create, a copy's import, a move); one that stores a document refuses any other.
  bind(documentId: string): void {
    if (this.documentId === null) this.documentId = documentId;
    else if (this.documentId !== documentId) {
      const error = new RoomIdMismatchError(this.documentId, documentId);
      console.error(`[room-route] failed id=${documentId} path=rpc error=${error.name}`);
      throw error;
    }
  }

  // The RPC surface, bound to `documentId`, once the room is ready to serve it: the only way in for an RPC, so none
  // skips the gate.
  async rpc(documentId: string, born = false): Promise<DocumentRoomRpc> {
    this.bind(documentId);
    await this.hooks.prepare(documentId);
    await this.ensureMoved(documentId, born);
    if (!this.env) throw new Error('room has no content store');
    return documentRpc(this.env, (p) => this.state.waitUntil(p));
  }

  // The move gate (docs/specs/006-document/document-storage-move.md, M1): before any content is served,
  // the room holds its document's content. A created or copied document is born moved (M4); any other moves now,
  // other requests waiting; a document D1 has no row for stays empty (G1). A failed move throws, answered 503
  // `content_moving`, and the next request tries again.
  async ensureMoved(documentId: string, born: boolean): Promise<void> {
    if (this.moved) return;
    const outcome = await this.moveOnce(documentId, born);
    if (outcome && outcome.status !== 'moved') throw new RoomNotReadyError(documentId, 'move');
  }

  // The `move` RPC (the sweep's): the room's move outcome, moving now when it has not; null for G1.
  async move(documentId: string): Promise<MoveOutcome | null> {
    return this.moveOnce(documentId, false);
  }

  private async moveOnce(documentId: string, born: boolean): Promise<MoveOutcome | null> {
    const db = this.db;
    const env = this.env;
    // A unit test's room without SQLite or bindings has no D1 to move from.
    if (!db || !env) {
      this.moved = true;
      return null;
    }
    const kv = this.state.storage.kv;
    let result: { outcome: MoveOutcome | null } | { error: unknown } = { outcome: null };
    // A throw inside blockConcurrencyWhile resets the object, so it is caught inside.
    await this.state.blockConcurrencyWhile(async () => {
      try {
        const now = Date.now();
        const stored = storedMove(kv);
        if (born && !stored) {
          result = { outcome: markBorn(kv, now) };
          return;
        }
        const room = {
          env,
          db,
          kv,
          transaction: <T>(fn: () => T): T => this.state.storage.transactionSync(fn),
          ensureSchema: () => this.ensureSchema(),
        };
        result = { outcome: await moveIntoRoom(room, documentId, now) };
      } catch (error) {
        result = { error };
      }
    });
    const settled = result as { outcome: MoveOutcome | null } | { error: unknown };
    if ('error' in settled) {
      const name = settled.error instanceof Error ? settled.error.name : typeof settled.error;
      console.error(
        `[content-move] failed id=${documentId} stage=gate error=${name}`,
        settled.error,
      );
      throw new RoomNotReadyError(documentId, 'move');
    }
    if (settled.outcome?.status === 'moved') this.moved = true;
    return settled.outcome;
  }

  // The earliest of the drains' deadlines, for the room's one alarm; null with nothing owed.
  deadline(): number | null {
    const due = [this.flushAt, this.shareAt, this.upkeepAt].filter((d): d is number => d !== null);
    return due.length > 0 ? Math.min(...due) : null;
  }

  // From the room's alarm: each drain that is due.
  async alarm(now: number): Promise<void> {
    await this.drainD1(now);
    await this.sendShares(now);
    await this.upkeep(now);
  }

  // At most once per UPKEEP_INTERVAL_MS (its last run recorded before it starts, so its own writes schedule no
  // other); next when the oldest thing left would age out. A failed run is tried again a day later.
  private async upkeep(now: number): Promise<void> {
    if (this.upkeepAt === null || this.upkeepAt > now) return;
    this.upkeepAt = null;
    const env = this.env;
    const documentId = this.documentId;
    const kv = this.state.storage.kv;
    if (!env || !documentId || !this.schemaReady || !kv) return;
    kv.put(UPKEEP_AT_KEY, now);
    let next: number | null;
    try {
      next = (await maintainRoom(env, documentId, now)).nextAt;
    } catch (error) {
      console.error(`[room-upkeep] failed id=${documentId}`, error);
      next = now + UPKEEP_INTERVAL_MS;
    }
    this.scheduleUpkeep(next);
  }

  private scheduleUpkeep(at: number | null): void {
    this.upkeepAt = at;
    const kv = this.state.storage.kv;
    if (at === null) kv?.delete(UPKEEP_DUE_KEY);
    else kv?.put(UPKEEP_DUE_KEY, at);
  }

  // A failed unit retries a minute later; keys left by a drain bounded at DRAIN_TABS go straight after.
  private async drainD1(now: number): Promise<void> {
    if (this.flushAt === null || this.flushAt > now) return;
    this.flushAt = null;
    const env = this.env;
    const documentId = this.documentId;
    if (!env || !documentId || !this.schemaReady) return;
    this.draining = true;
    try {
      const result = await drainOutbox(env, documentId);
      this.lastFlushAt = Date.now();
      if (result.failed > 0) this.flushAt = Date.now() + FLUSH_RETRY_MS;
      else if (result.more) this.flushAt = Date.now();
    } catch (error) {
      console.warn(`[outbox] unit failed id=${documentId} unit=read`, error);
      this.flushAt = Date.now() + FLUSH_RETRY_MS;
    } finally {
      this.draining = false;
    }
    // A key written while the drain ran goes next time.
    if (this.flushAt === null && this.owesD1()) {
      this.flushAt = nextFlushAt(Date.now(), this.lastFlushAt);
    }
  }

  // Send the other holders of its shared tabs what they are owed. A failed send retries a minute later; messages
  // left by a drain bounded at SHARE_DRAIN_MAX, or written while it ran, go once the room is quiet again.
  private async sendShares(now: number): Promise<void> {
    if (this.shareAt === null || this.shareAt > now) return;
    this.shareAt = null;
    const env = this.env;
    const documentId = this.documentId;
    if (!env || !documentId || !this.schemaReady) return;
    let retry: boolean;
    try {
      const result = await drainShares(env, documentId, (to, messages) =>
        documentRoom(env, to).receiveShares(documentId, messages),
      );
      retry = result.failed > 0;
    } catch (error) {
      console.warn(`[tab-shares] send failed id=${documentId} to=* kind=read`, error);
      retry = true;
    }
    if (retry) this.shareAt = Date.now() + FLUSH_RETRY_MS;
    else if (this.owesShares()) this.shareAt = Date.now() + FLUSH_IDLE_MS;
  }

  // A purge: every other holder of the document's shared tabs hears now that it left, PUSH_CONCURRENCY at once.
  // Best effort: a holder this misses answers `gone` the next time it sends here, and is dropped then.
  async leaveShares(): Promise<void> {
    const env = this.env;
    const documentId = this.documentId;
    if (!env || !documentId || !this.schemaReady) return;
    this.shareAt = null;
    // A room woken after a release reads its shares through the current schema.
    this.ensureSchema();
    const shares = await allShares(env);
    await pooled(
      shares.map(({ tabId, to }) => async () => {
        try {
          const [answer = 'ok'] = await documentRoom(env, to).receiveShares(documentId, [
            { kind: 'leave', tabId },
          ]);
          console.info(`[tab-shares] sent id=${documentId} to=${to} kind=leave answer=${answer}`);
        } catch (error) {
          console.warn(`[tab-shares] send failed id=${documentId} to=${to} kind=leave`, error);
        }
      }),
      PUSH_CONCURRENCY,
    );
  }

  // The SQLite the document's tabs live in, or null while this room stores none (before its schema): the room's
  // scoped structure check reads a stored tab from it as a frame arrives (room-scoped-structure.ts).
  tabStore(): SqlStorage | null {
    return this.schemaReady ? this.state.storage.sql : null;
  }

  // After the room's storage was deleted (a purge): this instance forgets the document it held, so a later create of
  // the same id (a document synced back from This Browser) starts from an empty room, schema and move record alike.
  forget(): void {
    this.documentId = null;
    this.schemaReady = false;
    this.migrated = false;
    this.moved = false;
    this.flushAt = null;
    this.shareAt = null;
    this.upkeepAt = null;
    this.lastFlushAt = 0;
  }

  private owesD1(): boolean {
    const sql = this.state.storage.sql;
    return sql.exec('SELECT 1 FROM outbox LIMIT 1').toArray().length > 0;
  }

  private owesShares(): boolean {
    const sql = this.state.storage.sql;
    return sql.exec('SELECT 1 FROM share_outbox LIMIT 1').toArray().length > 0;
  }

  // The schema on the first write (R1), never on construction or a read; once per instance, so a wake after a
  // release takes any new step before its first write.
  private ensureSchema(): void {
    if (this.migrated) return;
    const sql = this.state.storage.sql;
    const { from, to } = migrateDocumentSchema((q) => sql.exec(q));
    this.migrated = true;
    this.schemaReady = true;
    if (from !== to)
      console.info(
        `[room-schema] migrated id=${this.documentId ?? 'unbound'} from=${from} to=${to}`,
      );
  }

  // A write happened: arm the D1 drain on idle, at most once a minute (the drain's own writes schedule nothing),
  // and the shared tabs' sends on idle.
  private noteWrite(): void {
    if (!this.schemaReady) return;
    let armed = false;
    if (!this.draining && this.flushAt === null && this.owesD1()) {
      this.flushAt = nextFlushAt(Date.now(), this.lastFlushAt);
      armed = true;
    }
    if (this.shareAt === null && this.owesShares()) {
      this.shareAt = Date.now() + FLUSH_IDLE_MS;
      armed = true;
    }
    const kv = this.state.storage.kv;
    if (this.upkeepAt === null && this.documentId !== null && kv) {
      const last = kv.get(UPKEEP_AT_KEY);
      this.scheduleUpkeep(
        upkeepAfterWrite(Date.now(), typeof last === 'number' ? last : 0, FLUSH_IDLE_MS),
      );
      armed = true;
    }
    if (armed) this.hooks.armAlarm();
  }
}

// The env's DOCUMENT_ROOM, answering this room's own id with the room itself: code the worker and the room share
// (a document read's outline, the room's relays) calls straight in rather than through a stub.
function localNamespace(
  real: Env['DOCUMENT_ROOM'] | undefined,
  own: DurableObjectId,
  room: DocumentRoom,
): Env['DOCUMENT_ROOM'] {
  const self = inProcessRoom(room);
  // A unit test builds a room without bindings; its own id is still answered.
  return new Proxy(real ?? ({} as Env['DOCUMENT_ROOM']), {
    get: (target, prop, receiver) => {
      if (prop === 'get') {
        return (id: DurableObjectId, opts?: DurableObjectNamespaceGetDurableObjectOptions) =>
          id.equals(own) ? self : target.get(id, opts);
      }
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}

// The room as its own stub: a stub's fetch takes (input, init), the class's fetch one Request, so callers that pass a
// URL and an init (documentRoom().fetch, every relay) reach it with their method, headers and body intact.
export function inProcessRoom<T extends { fetch(request: Request): Promise<Response> }>(
  room: T,
): T {
  return new Proxy(room, {
    get: (target, prop, receiver) => {
      if (prop === 'fetch') {
        return (input: Request | string, init?: RequestInit) =>
          target.fetch(new Request(input, init));
      }
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
