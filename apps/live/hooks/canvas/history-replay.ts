import type { Tab } from '@livedoc/document';

// The peer ops an undo or redo snapshot has yet to take (docs/specs/012-collaboration/
// realtime-conflict-resolution.md "Undo"). A peer's op reaches the present when it arrives and a
// snapshot only when undo, redo or a cancel brings that snapshot back: applying it to all of them
// on arrival cost one pass over the tab per snapshot, measured 200 to 300 ms for one peer save of
// 20 ops against 500 steps of a 1,000-element board. Replayed in arrival order, a restored snapshot
// holds exactly what it held when every op was applied to it on arrival.

// A peer's op as a pure function over a tab list. `replaying` is true when it runs on a snapshot
// being restored, long after it arrived: the op's side effects (an article's growth mark) were
// taken then, on the present, and are not taken again.
export type RemoteApply = (tabs: Tab[], replaying: boolean) => Tab[];

// The ops since the stalest snapshot was taken: `ops[0]` is op number `first`. A snapshot stamped
// `at` holds every op numbered below `at` and takes the rest when restored.
export type Replay = { readonly first: number; readonly ops: readonly RemoteApply[] };

// Ops held before the oldest are applied to the snapshots that still lack them, one op per new op,
// so a person who never edits in a busy room keeps a bounded log and pays per op what eager
// application cost (the snapshots at the oldest stamp), never more. Safe range: 1 to ~10,000; each
// op holds one peer frame.
export const REPLAY_LIMIT = 1000;

export const EMPTY_REPLAY: Replay = { first: 0, ops: [] };

export const replayHead = (replay: Replay): number => replay.first + replay.ops.length;

// A snapshot stamped `at`, with the ops it lacks applied in arrival order.
export function catchUp(tabs: Tab[], at: number, replay: Replay): Tab[] {
  let out = tabs;
  for (let i = Math.max(at - replay.first, 0); i < replay.ops.length; i++) {
    out = replay.ops[i]!(out, true);
  }
  return out;
}

// The log without the ops every snapshot already holds; `stamps` are every kept snapshot's.
export function pruneReplay(replay: Replay, stamps: readonly number[]): Replay {
  let oldest = replayHead(replay);
  for (const at of stamps) if (at < oldest) oldest = at;
  if (oldest <= replay.first) return replay;
  return { first: oldest, ops: replay.ops.slice(oldest - replay.first) };
}

// Over REPLAY_LIMIT: the oldest op goes to the snapshots that lack it, and leaves the log.
export function compactReplay(
  snapshots: { tabs: Tab[][]; stamps: number[] },
  replay: Replay,
): { tabs: Tab[][]; stamps: number[]; replay: Replay } {
  const oldest = replay.ops[0];
  if (replay.ops.length <= REPLAY_LIMIT || !oldest) return { ...snapshots, replay };
  const tabs = snapshots.tabs.map((t, i) =>
    snapshots.stamps[i] === replay.first ? oldest(t, true) : t,
  );
  const stamps = snapshots.stamps.map((at) => (at === replay.first ? at + 1 : at));
  return { tabs, stamps, replay: { first: replay.first + 1, ops: replay.ops.slice(1) } };
}
