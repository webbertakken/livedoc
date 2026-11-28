// A text changeset reverted (docs/specs/024-agents/agent-changesets.md "A text document's changesets", Revert): its
// undo step undone as a new change by a client of its own, so what it wrote is deleted, what it deleted is written again
// where it stood, and what anyone wrote since stays. The threads it began are resolved, never deleted.
import * as Y from 'yjs';
import { LiveThreads } from '../live/live-threads';
import { TextDocumentState } from '../text-document-state';
import { UndoSteps } from '../versions/undo-step';
import { AGENT_TEXT_ORIGIN } from './apply';

/** The update that reverts the changeset; null when it changes nothing, or the step does not read. */
export function revertTextChangeset(
  state: readonly Uint8Array[],
  encodedStep: Uint8Array,
  threads: readonly string[],
): Uint8Array | null {
  const step = UndoSteps.decode(encodedStep);
  if (!step) return null;
  const doc = TextDocumentState.load(state);
  const updates: Uint8Array[] = [];
  doc.on('update', (update: Uint8Array) => updates.push(update));
  UndoSteps.undoUpdate(doc, step);
  for (const id of threads) {
    const open = LiveThreads.read(doc).some((t) => t.id === id && !t.resolved);
    if (open) LiveThreads.resolve(doc, id, true, AGENT_TEXT_ORIGIN);
  }
  doc.destroy();
  return updates.length > 0 ? Y.mergeUpdates(updates) : null;
}
