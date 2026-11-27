// Restoring a version (docs/specs/034-text-documents/live-editing-and-storage.md "Restoring a version"): one change
// that undoes what changed since it. What was written since is deleted, what was deleted since is written again where
// it stood, and what stayed unchanged keeps its identity, so comment anchors on it still resolve. Comment threads are
// never restored. Yjs's undo does exactly this for one undo step; the restore hands it a step spanning everything
// since the version.
import * as Y from 'yjs';
import { THREADS_MAP } from '../live/live-names';
import { TextDocumentState } from '../text-document-state';
import { deleteRange, VersionSnapshots, type DeleteSet } from './version-snapshots';

/** The fields Yjs's undo reads of a step; a test pins them against Yjs's own, so an upgrade that changes them fails. */
export const STACK_ITEM_FIELDS = ['insertions', 'deletions', 'meta'] as const;

type UndoStep = { insertions: DeleteSet; deletions: DeleteSet; meta: Map<unknown, unknown> };

/** Every item written since the version: per client, the clocks past what the version held. */
function writtenSince(version: Y.Snapshot, now: Y.Snapshot): DeleteSet {
  const ds = Y.createDeleteSet();
  for (const [client, clock] of now.sv) {
    const from = version.sv.get(client) ?? 0;
    if (clock > from) ds.clients.set(client, [deleteRange(from, clock - from)]);
  }
  return ds;
}

/**
 * The one update that makes the state read as the version, written by a client of its own; null when it already
 * does. Concurrent updates the state lacks stay on top of it when they arrive.
 */
export function restoreUpdate(
  stateUpdates: readonly Uint8Array[],
  version: Y.Snapshot,
): Uint8Array | null {
  const doc = TextDocumentState.load(stateUpdates);
  const now = Y.snapshot(doc);
  const step: UndoStep = {
    insertions: writtenSince(version, now),
    deletions: VersionSnapshots.minus(now.ds, version.ds),
    meta: new Map(),
  };
  if (step.insertions.clients.size === 0 && step.deletions.clients.size === 0) return null;
  const scope = [...doc.share].filter(([name]) => name !== THREADS_MAP).map(([, type]) => type);
  const undo = new Y.UndoManager(scope, { captureTimeout: 0 });
  undo.undoStack.push(step);
  let update: Uint8Array | null = null;
  doc.on('update', (written: Uint8Array) => {
    update = update ? Y.mergeUpdates([update, written]) : written;
  });
  undo.undo();
  undo.destroy();
  doc.destroy();
  return update;
}
