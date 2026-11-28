// A spreadsheet's comment threads in the browser (docs/specs/029-sheets/review.md "Comments"): every thread of the
// workbook by id, read once and kept current by the api's answers and the room's relays, each thread at the highest
// `v` this session has seen, so a relay arriving after the answer it repeats changes nothing. An external store: the
// grid, the card and the Comments panel read it through its version.
import type { SheetThreadRoomOp } from '@livedoc/api-schema';
import type { SheetThread, SheetThreadOp } from '@livedoc/document';
import { fetchSheetThreads, postSheetThread } from '@/lib/api/sheet-threads';
import type { SheetsScope } from '@/lib/api/sheets';
import { ApiError } from '@/lib/api/core';
import { debugLog } from '@/lib/debug-log';

export type ThreadSend = { ok: true; thread: SheetThread | null } | { ok: false; code: string };

export class SheetThreadsStore {
  private readonly threads = new Map<string, SheetThread>();
  // The highest `v` seen of each thread, a removed one's too, so a late relay never brings it back.
  private readonly seen = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private loading: Promise<void> | null = null;

  private readonly scope: SheetsScope;

  constructor(scope: SheetsScope) {
    this.scope = scope;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /** Every thread, a sheet's when named, in no set order. */
  list(sheetId?: string): SheetThread[] {
    const all = [...this.threads.values()];
    return sheetId === undefined ? all : all.filter((t) => t.sheetId === sheetId);
  }

  thread(id: string): SheetThread | undefined {
    return this.threads.get(id);
  }

  // A thread's state as the api or the room gave it, kept when newer than what this session holds. `removedAt`: the
  // `v` a removal was answered at, past every state the thread had.
  private take(id: string, thread: SheetThread | null, removedAt: number): boolean {
    const v = thread?.v ?? removedAt;
    if ((this.seen.get(id) ?? 0) >= v) return false;
    this.seen.set(id, v);
    if (thread) this.threads.set(id, thread);
    else this.threads.delete(id);
    return true;
  }

  /** Reads the workbook's threads, once at a time; again on a resync. */
  load(): Promise<void> {
    this.loading ??= fetchSheetThreads(this.scope)
      .then((threads) => {
        this.threads.clear();
        for (const t of threads) {
          this.threads.set(t.id, t);
          this.seen.set(t.id, Math.max(this.seen.get(t.id) ?? 0, t.v));
        }
        debugLog(`[sheets] threads loaded count=${threads.length}`);
        this.changed();
      })
      .catch((error: unknown) => {
        debugLog(`[sheets] threads load failed ${String(error)}`);
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  /** A thread the room relayed. */
  receive(op: SheetThreadRoomOp): void {
    const removedAt = (this.threads.get(op.id)?.v ?? this.seen.get(op.id) ?? 0) + 1;
    if (this.take(op.id, op.thread, removedAt)) this.changed();
  }

  /** One op sent to the api; the thread it answers is kept. */
  async send(sheetId: string, op: SheetThreadOp): Promise<ThreadSend> {
    try {
      const res = await postSheetThread(this.scope, sheetId, op);
      const removedAt = (this.threads.get(res.id)?.v ?? 0) + 1;
      if (this.take(res.id, res.thread, removedAt)) this.changed();
      debugLog(`[sheets] thread ${op.op} sent thread=${res.id} v=${res.thread?.v ?? 'gone'}`);
      return { ok: true, thread: res.thread };
    } catch (error) {
      const code = error instanceof ApiError ? (error.code ?? String(error.status)) : 'network';
      debugLog(`[sheets] thread ${op.op} refused ${code}`);
      return { ok: false, code };
    }
  }
}

const BY_SCOPE = new WeakMap<object, SheetThreadsStore>();

/** The threads store of a sheet store (one a document), made on first ask. */
export function sheetThreadsFor(owner: object, scope: SheetsScope): SheetThreadsStore {
  let store = BY_SCOPE.get(owner);
  if (!store) {
    store = new SheetThreadsStore(scope);
    BY_SCOPE.set(owner, store);
  }
  return store;
}
