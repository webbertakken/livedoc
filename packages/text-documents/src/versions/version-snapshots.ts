// A text document's versions as the room keeps them (docs/specs/034-text-documents/live-editing-and-storage.md
// "Versions"): a Yjs snapshot stored as its state vector and the deletions it adds over the version before it, so a
// version reads whole as its state vector with the union of its own and every earlier kept version's deletions.
import * as Y from 'yjs';

/** A Yjs delete set (Yjs exports its maker, not its type). */
export type DeleteSet = ReturnType<typeof Y.createDeleteSet>;
type DeleteItem = DeleteSet['clients'] extends Map<number, (infer I)[]> ? I : never;
type DeleteRange = { clock: number; len: number };

/** A range as Yjs holds one: its delete item is a plain clock and length. */
export const deleteRange = (clock: number, len: number): DeleteItem => ({ clock, len });

// Yjs encodes a delete set only inside a snapshot or an update: deletions are kept as a snapshot with no state vector.
const NO_STATE = new Map<number, number>();

const rangesOf = (ds: DeleteSet, client: number): DeleteRange[] =>
  (ds.clients.get(client) ?? [])
    .map(({ clock, len }) => ({ clock, len }))
    .sort((a, b) => a.clock - b.clock);

/** The parts of `range` no range of `taken` (sorted by clock) covers. */
function rangeMinus(range: DeleteRange, taken: readonly DeleteRange[]): DeleteRange[] {
  const left: DeleteRange[] = [];
  let from = range.clock;
  const end = range.clock + range.len;
  for (const cut of taken) {
    const cutEnd = cut.clock + cut.len;
    if (cutEnd <= from) continue;
    if (cut.clock >= end) break;
    if (cut.clock > from) left.push({ clock: from, len: cut.clock - from });
    from = Math.max(from, cutEnd);
    if (from >= end) break;
  }
  if (from < end) left.push({ clock: from, len: end - from });
  return left;
}

/** The delete set as a Yjs one, its ranges merged and sorted. */
function deleteSetOf(clients: ReadonlyMap<number, DeleteRange[]>): DeleteSet {
  const ds = Y.createDeleteSet();
  for (const [client, ranges] of clients)
    if (ranges.length > 0)
      ds.clients.set(
        client,
        ranges.map((r) => deleteRange(r.clock, r.len)),
      );
  return Y.mergeDeleteSets([ds]);
}

const decodedStateVector = (stateVector: Uint8Array): Map<number, number> =>
  Y.decodeStateVector(stateVector);

export const VersionSnapshots = {
  /** Deletions as bytes: a Yjs snapshot holding them and no state vector. */
  encodeDeletions: (ds: DeleteSet): Uint8Array => Y.encodeSnapshot(Y.createSnapshot(ds, NO_STATE)),
  decodeDeletions: (bytes: Uint8Array): DeleteSet => Y.decodeSnapshot(bytes).ds,
  /** Everything an update deletes. */
  deletionsOf: (update: Uint8Array): DeleteSet => Y.decodeUpdate(update).ds,
  /** The deletions of `a` that `b` does not hold, range by range. */
  minus: (a: DeleteSet, b: DeleteSet): DeleteSet => {
    const left = new Map<number, DeleteRange[]>();
    for (const client of a.clients.keys()) {
      const taken = rangesOf(b, client);
      const kept = rangesOf(a, client).flatMap((range) => rangeMinus(range, taken));
      if (kept.length > 0) left.set(client, kept);
    }
    return deleteSetOf(left);
  },
  /** Every deletion of the list, merged. */
  union: (list: readonly DeleteSet[]): DeleteSet =>
    list.length === 0 ? Y.createDeleteSet() : Y.mergeDeleteSets([...list]),
  /** The deletions a version adds over the versions kept before it. */
  added: (stateDeletions: DeleteSet, earlier: readonly DeleteSet[]): DeleteSet =>
    VersionSnapshots.minus(stateDeletions, VersionSnapshots.union(earlier)),
  /** The whole snapshot of a version: its state vector, and its own deletions with every earlier kept version's. */
  snapshotOf: (stateVector: Uint8Array, deletions: readonly DeleteSet[]): Y.Snapshot =>
    Y.createSnapshot(VersionSnapshots.union(deletions), decodedStateVector(stateVector)),
  /** The clients an update's items are written by, each once, in order. */
  clientsOf: (update: Uint8Array): number[] => [
    ...new Set(Y.decodeUpdate(update).structs.map((struct) => struct.id.client)),
  ],
  /** The clients whose writing grew from one state vector to the next. */
  advanced: (before: Uint8Array, after: Uint8Array): number[] => {
    const was = decodedStateVector(before);
    return [...decodedStateVector(after)]
      .filter(([client, clock]) => clock > (was.get(client) ?? 0))
      .map(([client]) => client);
  },
  /** Whether two state vectors hold the same writing. */
  sameState: (a: Uint8Array, b: Uint8Array): boolean => {
    const left = decodedStateVector(a);
    const right = decodedStateVector(b);
    return (
      left.size === right.size && [...left].every(([client, clock]) => right.get(client) === clock)
    );
  },
} as const;
