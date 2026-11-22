// The changes made on this surface that the room has not confirmed (docs/specs/035-pdf-documents/
// live-editing-and-storage.md "Limits"): when the room refuses one, the newest is taken back, so what the surface
// shows is what everyone holds. Only this person's own changes are ever taken back, as their undo would
// ("Undo").
import * as Y from 'yjs';
import { PdfLiveChanges } from '@livedoc/pdf-documents';

export type UnconfirmedPdfChanges = {
  /** The room holds every change made here so far. */
  confirmed: () => void;
  /** Takes back the newest change the room has not confirmed; false when there is none. */
  undoNewest: () => boolean;
  close: () => void;
};

export function unconfirmedPdfChanges(doc: Y.Doc): UnconfirmedPdfChanges {
  // Each change its own step: a refusal answers one frame, and a frame is one change.
  const steps = new Y.UndoManager([...PdfLiveChanges.roots(doc)], { captureTimeout: 0 });
  let unconfirmed = 0;
  const onStep = ({ type }: { type: 'undo' | 'redo' }) => {
    if (type === 'undo' && !steps.undoing && !steps.redoing) unconfirmed += 1;
  };
  steps.on('stack-item-added', onStep);
  return {
    confirmed: () => {
      unconfirmed = 0;
      steps.clear();
    },
    undoNewest: () => {
      if (unconfirmed === 0) return false;
      unconfirmed -= 1;
      steps.undo();
      // A refused change is gone for good: nothing brings it back.
      steps.clear(false, true);
      return true;
    },
    close: () => {
      steps.off('stack-item-added', onStep);
      steps.destroy();
      unconfirmed = 0;
    },
  };
}
