// One step of Yjs's undo, taken by hand (docs/specs/034-text-documents/live-editing-and-storage.md "Restoring a
// version", docs/specs/024-agents/agent-changesets.md "A text document's changesets"): what a change wrote and what it
// deleted, undone as a new change. What it wrote is deleted, what it deleted is written again where it stood, and what
// anyone wrote since stays. Comment threads are never undone: their map is outside the step's scope.
import * as Y from 'yjs';
import { THREADS_MAP } from '../live/live-names';
import { deleteRange, VersionSnapshots, type DeleteSet } from './version-snapshots';

/** The fields Yjs's undo reads of a step; a test pins them against Yjs's own, so an upgrade that changes them fails. */
export const STACK_ITEM_FIELDS = ['insertions', 'deletions', 'meta'] as const;

/** What a change wrote (`insertions`, as ranges of clocks) and what it deleted. */
export type UndoStep = { readonly insertions: DeleteSet; readonly deletions: DeleteSet };

/** Bytes of an encoded step's insertions length: a 32-bit unsigned count before them. */
const LENGTH_BYTES = 4;

const isEmpty = (step: UndoStep): boolean =>
  step.insertions.clients.size === 0 && step.deletions.clients.size === 0;

export const UndoSteps = {
  isEmpty,

  /** What changed from one snapshot to a later one: each client's clocks past the first, and the deletions added. */
  between: (before: Y.Snapshot, after: Y.Snapshot): UndoStep => {
    const insertions = Y.createDeleteSet();
    for (const [client, clock] of after.sv) {
      const from = before.sv.get(client) ?? 0;
      if (clock > from) insertions.clients.set(client, [deleteRange(from, clock - from)]);
    }
    return { insertions, deletions: VersionSnapshots.minus(after.ds, before.ds) };
  },

  /** What an update wrote and deleted: each client's clocks it holds, and its deletions. */
  ofUpdate: (update: Uint8Array): UndoStep => {
    const { structs, ds } = Y.decodeUpdate(update);
    const ranges = new Map<number, { from: number; to: number }>();
    for (const struct of structs) {
      const { client, clock } = struct.id;
      const held = ranges.get(client);
      const to = clock + struct.length;
      ranges.set(
        client,
        held
          ? { from: Math.min(held.from, clock), to: Math.max(held.to, to) }
          : { from: clock, to },
      );
    }
    const insertions = Y.createDeleteSet();
    for (const [client, { from, to }] of ranges)
      insertions.clients.set(client, [deleteRange(from, to - from)]);
    return { insertions, deletions: ds };
  },

  /** The update that undoes the step on `doc`, written by `doc`'s client; null when the step is empty. */
  undoUpdate: (doc: Y.Doc, step: UndoStep): Uint8Array | null => {
    if (isEmpty(step)) return null;
    const scope = [...doc.share].filter(([name]) => name !== THREADS_MAP).map(([, type]) => type);
    const undo = new Y.UndoManager(scope, { captureTimeout: 0 });
    undo.undoStack.push({ ...step, meta: new Map() });
    let update: Uint8Array | null = null;
    const collect = (written: Uint8Array) => {
      update = update ? Y.mergeUpdates([update, written]) : written;
    };
    doc.on('update', collect);
    undo.undo();
    doc.off('update', collect);
    undo.destroy();
    return update;
  },

  /** The step as bytes: its insertions' length, its insertions, then its deletions, each as encoded deletions. */
  encode: (step: UndoStep): Uint8Array => {
    const insertions = VersionSnapshots.encodeDeletions(step.insertions);
    const deletions = VersionSnapshots.encodeDeletions(step.deletions);
    const bytes = new Uint8Array(LENGTH_BYTES + insertions.length + deletions.length);
    new DataView(bytes.buffer).setUint32(0, insertions.length);
    bytes.set(insertions, LENGTH_BYTES);
    bytes.set(deletions, LENGTH_BYTES + insertions.length);
    return bytes;
  },

  /** An encoded step read back; null for bytes that are not one. */
  decode: (bytes: Uint8Array): UndoStep | null => {
    try {
      if (bytes.length < LENGTH_BYTES) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const length = view.getUint32(0);
      if (LENGTH_BYTES + length > bytes.length) return null;
      return {
        insertions: VersionSnapshots.decodeDeletions(
          bytes.subarray(LENGTH_BYTES, LENGTH_BYTES + length),
        ),
        deletions: VersionSnapshots.decodeDeletions(bytes.subarray(LENGTH_BYTES + length)),
      };
    } catch {
      return null;
    }
  },
} as const;
