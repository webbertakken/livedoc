// One person's undo on a PDF document (docs/specs/035-pdf-documents/live-editing-and-storage.md "Undo"): their own
// changes only, newest first, on one timeline across the editing modes. It is Yjs's own undo over every root of the
// live changes but `stored`, tracking the origin a person's change is made with: another person's change is never
// taken back or written over, and a step with nothing of its own left is passed over. One act is one step; what is
// typed within PDF_UNDO_GROUP_MS is one too. Each step remembers where it was made, and says so when it returns.
import * as Y from 'yjs';
import { PDF_UNDO_GROUP_MS, PdfLiveChanges, type PageName } from '@livedoc/pdf-documents';

/** The origin a person's own change is made with. */
export const PDF_LOCAL_ORIGIN = 'pdf-local';

/** Where a step was made. */
export type PdfUndoPlace = { readonly page: PageName };

/** A step left open: every change made until it closes is one step, however long it takes. */
export type PdfOpenStep = {
  /** The step ends here; what follows groups by the group's time again. */
  close: () => void;
  /** The step ends and leaves no step: what it changed netted out (a box typed in and emptied again). */
  discard: () => void;
};

export type PdfUndoState = { readonly canUndo: boolean; readonly canRedo: boolean };

export type PdfUndo = {
  /** Makes what `act` changes one step of its own, made at `place`; answers what `act` does. */
  step: <Made>(place: PdfUndoPlace, act: () => Made) => Made;
  /** Opens a step made at `place`, closing one already open (live-editing-and-storage.md "A mark as it is made"). */
  open: (place: PdfUndoPlace) => PdfOpenStep;
  undo: () => void;
  redo: () => void;
  /** Whether there is a step to take back, and one to make again; the same object until either changes. */
  get: () => PdfUndoState;
  subscribe: (listener: () => void) => () => void;
  /** Listen for a step taken back or made again, with where it was made. */
  onReturn: (listener: (place: PdfUndoPlace) => void) => () => void;
  /** Stop watching the live changes; the steps go. */
  destroy: () => void;
};

const PLACE = 'place';

/**
 * The undo of the person whose changes to `doc` are made with PDF_LOCAL_ORIGIN. `groupMs`: how close two changes
 * made outside a step must be to be one, for a test that cannot wait the real time.
 */
export function pdfUndo(doc: Y.Doc, groupMs: number = PDF_UNDO_GROUP_MS): PdfUndo {
  const manager = new Y.UndoManager(PdfLiveChanges.undoScope(doc), {
    trackedOrigins: new Set([PDF_LOCAL_ORIGIN]),
    captureTimeout: groupMs,
  });
  const listeners = new Set<() => void>();
  const returns = new Set<(place: PdfUndoPlace) => void>();
  let state: PdfUndoState = { canUndo: false, canRedo: false };
  // The place of the step being made, while `step` runs.
  let placing: PdfUndoPlace | null = null;
  // The step left open, and whether it has made a step on the stack yet.
  let opened: { made: boolean } | null = null;

  const changed = () => {
    const canUndo = manager.undoStack.length > 0;
    const canRedo = manager.redoStack.length > 0;
    if (canUndo === state.canUndo && canRedo === state.canRedo) return;
    state = { canUndo, canRedo };
    for (const listener of [...listeners]) listener();
  };
  manager.on('stack-item-added', ({ stackItem }) => {
    if (placing) stackItem.meta.set(PLACE, placing);
    if (opened) opened.made = true;
    changed();
  });
  manager.on('stack-item-popped', ({ stackItem, type }) => {
    const place = stackItem.meta.get(PLACE) as PdfUndoPlace | undefined;
    if (place) {
      // The step that takes this one back, or makes it again, was made at the same place.
      (type === 'undo' ? manager.redoStack : manager.undoStack).at(-1)?.meta.set(PLACE, place);
      for (const listener of [...returns]) listener(place);
    }
    changed();
  });
  manager.on('stack-cleared', changed);

  return {
    step: (place, act) => {
      manager.stopCapturing();
      placing = place;
      try {
        return act();
      } finally {
        placing = null;
        manager.stopCapturing();
      }
    },
    open: (place) => {
      manager.stopCapturing();
      const own = { made: false };
      opened = own;
      placing = place;
      manager.captureTimeout = Number.POSITIVE_INFINITY;
      const end = () => {
        if (opened !== own) return false;
        opened = null;
        placing = null;
        manager.captureTimeout = groupMs;
        manager.stopCapturing();
        return true;
      };
      return {
        close: () => void end(),
        discard: () => {
          if (!end() || !own.made) return;
          manager.undoStack.pop();
          changed();
        },
      };
    },
    undo: () => void manager.undo(),
    redo: () => void manager.redo(),
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onReturn: (listener) => {
      returns.add(listener);
      return () => returns.delete(listener);
    },
    destroy: () => {
      manager.destroy();
      listeners.clear();
      returns.clear();
    },
  };
}
