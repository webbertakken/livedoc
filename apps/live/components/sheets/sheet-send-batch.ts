// A sheet's writes made in the same moment, sent as fewer (docs/specs/029-sheets/sheet-store.md "Changing a sheet",
// write batching): every write is seen at once and goes on the sheet's pending list as made; at the next task, before
// the next frame paints, each sheet's run of writes with the same flags is merged by `coalesceWrites`, and the merged
// writes take the run's place on the pending list under new wids. Undo steps are the store's, made from the writes as
// made, and are not touched.
import { coalesceWrites, type SheetWrite } from '@livedoc/sheets';
import { debugLog } from '@/lib/debug-log';

export type SendFlags = { undo?: true; unchecked?: true };
export type PendingWrite = { wid: string; write: SheetWrite };

export type SendBatchHost = {
  // The sheet's pending writes (the list itself, edited in place), or undefined once the sheet has gone.
  pending: (sheetId: string) => PendingWrite[] | undefined;
  send: (sheetId: string, wid: string, write: SheetWrite, flags: SendFlags) => void;
  newWid: () => string;
  // When the writes gathered go: the next task by default; injected in tests.
  later: (go: () => void) => void;
};

type Queued = PendingWrite & { flags: SendFlags };

const sameFlags = (a: SendFlags, b: SendFlags): boolean =>
  a.undo === b.undo && a.unchecked === b.unchecked;

export class SendBatch {
  private readonly host: SendBatchHost;
  private readonly queued = new Map<string, Queued[]>();
  private scheduled = false;

  constructor(host: SendBatchHost) {
    this.host = host;
  }

  /** A write made now: pending at once, sent with the others made in the same moment. */
  add(sheetId: string, write: SheetWrite, flags: SendFlags): void {
    const wid = this.host.newWid();
    this.host.pending(sheetId)?.push({ wid, write });
    const list = this.queued.get(sheetId) ?? [];
    list.push({ wid, write, flags });
    this.queued.set(sheetId, list);
    if (this.scheduled) return;
    this.scheduled = true;
    this.host.later(() => this.flush());
  }

  /** Send everything gathered now (at its moment, or before the store settles). */
  flush(): void {
    this.scheduled = false;
    const all = [...this.queued];
    this.queued.clear();
    for (const [sheetId, list] of all) {
      let run: Queued[] = [];
      for (const q of list) {
        if (run.length > 0 && !sameFlags(run[0]!.flags, q.flags)) {
          this.sendRun(sheetId, run);
          run = [];
        }
        run.push(q);
      }
      this.sendRun(sheetId, run);
    }
  }

  private sendRun(sheetId: string, run: readonly Queued[]): void {
    const flags = run[0]!.flags;
    const merged = coalesceWrites(run.map((q) => q.write));
    const pending = this.host.pending(sheetId);
    const wids = new Set(run.map((q) => q.wid));
    const at = pending ? pending.findIndex((p) => wids.has(p.wid)) : -1;
    // Nothing to merge, or the sheet gone (its writes still go, as made, to be answered as such).
    if (merged.length === run.length || !pending || at < 0) {
      for (const q of run) this.host.send(sheetId, q.wid, q.write, q.flags);
      return;
    }
    debugLog('[sheets] sheets.write.batched', { writes: run.length, sent: merged.length });
    const kept = pending.filter((p) => !wids.has(p.wid));
    const sent = merged.map((write) => ({ wid: this.host.newWid(), write }));
    pending.splice(0, pending.length, ...kept.slice(0, at), ...sent, ...kept.slice(at));
    for (const s of sent) this.host.send(sheetId, s.wid, s.write, flags);
  }
}
