// Restoring a version (docs/specs/034-text-documents/live-editing-and-storage.md "Restoring a version"): one change
// that undoes what changed since it. What was written since is deleted, what was deleted since is written again where
// it stood, and what stayed unchanged keeps its identity, so comment anchors on it still resolve. Comment threads are
// never restored. Yjs's undo does exactly this for one undo step; the restore hands it a step spanning everything
// since the version.
import * as Y from 'yjs';
import { TextDocumentState } from '../text-document-state';
import { UndoSteps } from './undo-step';

/**
 * The one update that makes the state read as the version, written by a client of its own; null when it already
 * does. Concurrent updates the state lacks stay on top of it when they arrive.
 */
export function restoreUpdate(
  stateUpdates: readonly Uint8Array[],
  encodedVersion: Uint8Array,
): Uint8Array | null {
  const doc = TextDocumentState.load(stateUpdates);
  const update = UndoSteps.undoUpdate(
    doc,
    UndoSteps.between(Y.decodeSnapshot(encodedVersion), Y.snapshot(doc)),
  );
  doc.destroy();
  return update;
}

/** The document as it read at a version (an encoded snapshot), drawn from a state that holds it; read-only. */
export function versionDocument(
  stateUpdates: readonly Uint8Array[],
  encodedVersion: Uint8Array,
): Y.Doc {
  return Y.createDocFromSnapshot(
    TextDocumentState.load(stateUpdates),
    Y.decodeSnapshot(encodedVersion),
  );
}
