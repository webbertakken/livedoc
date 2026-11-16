'use client';

import { useCallback, useState } from 'react';
import { useLatest } from '@/hooks/ui/useLatest';
import type { Selection } from '@/lib/selection-store';
import {
  EMPTY_JOURNAL,
  journalAfterRedo,
  journalAfterUndo,
  journalLiveRedo,
  journalPush,
  journalPushAside,
  journalRedoTarget,
  journalUndoTarget,
  type HistoryPosition,
  type ItemUndoStep,
} from './item-undo-journal';

// Wraps the tab history's undo and redo so item changes take their turn in one timeline with
// canvas edits (docs/specs/026-plan/items.md "Undo"; ./item-undo-journal.ts says how).
export function useItemUndo(history: {
  depth: number;
  branch: number;
  futureLength: number;
  canUndo: boolean;
  canRedo: boolean;
  // A canvas step's undo and redo return the selection it kept (useDocumentHistory).
  undo: () => Selection | null;
  redo: () => Selection | null;
  clearRedo: () => void;
}) {
  const [journal, setJournal] = useState(EMPTY_JOURNAL);
  const journalRef = useLatest(journal);
  const at: HistoryPosition = {
    depth: history.depth,
    branch: history.branch,
    futureLength: history.futureLength,
  };
  const atRef = useLatest(at);
  const { clearRedo } = history;

  // Records an item change made by this person. Its redo side is gone, the canvas's too.
  const push = useCallback(
    (step: ItemUndoStep) => {
      clearRedo();
      // The push lands on the branch clearRedo opens.
      const now = atRef.current;
      setJournal((j) => journalPush(j, step, { ...now, branch: now.branch + 1, futureLength: 0 }));
    },
    [clearRedo, atRef],
  );

  // Records a step that changes only what this person sees (a deselect): the redo side stays.
  const pushAside = useCallback(
    (step: ItemUndoStep) => setJournal((j) => journalPushAside(j, step, atRef.current)),
    [atRef],
  );

  const live = journalLiveRedo(journal, at);
  const itemUndo = journalUndoTarget(journal, at);
  const itemRedo = journalRedoTarget(live, at);

  // Undo takes the newest step: one beside the canvas when none of the canvas's is newer, passing over any with
  // nothing left to take back. A canvas step returns the selection it kept; one beside it, undefined.
  const undo = (): Selection | null | undefined => {
    const at = atRef.current;
    let j = journalRef.current;
    for (let step = journalUndoTarget(j, at); step; step = journalUndoTarget(j, at)) {
      const took = step.undo();
      j = journalAfterUndo(j, at);
      if (took !== false) {
        setJournal(j);
        return undefined;
      }
    }
    setJournal(j);
    return history.canUndo ? history.undo() : undefined;
  };

  const redo = (): Selection | null | undefined => {
    const at = atRef.current;
    let j = journalLiveRedo(journalRef.current, at);
    for (let step = journalRedoTarget(j, at); step; step = journalRedoTarget(j, at)) {
      const took = step.redo();
      j = journalAfterRedo(j, at);
      if (took !== false) {
        setJournal(j);
        return undefined;
      }
    }
    setJournal(j);
    return history.canRedo ? history.redo() : undefined;
  };

  return {
    push,
    pushAside,
    undo,
    redo,
    canUndo: history.canUndo || itemUndo !== null,
    canRedo: history.canRedo || itemRedo !== null,
  };
}
