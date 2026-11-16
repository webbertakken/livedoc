import { useLayoutEffect, useRef } from 'react';
import type { Element, Tab } from '@livedoc/document';
import { announce } from '@/lib/announcer';
import { track } from '@/lib/telemetry';
import { useLatest } from '@/hooks/ui/useLatest';
import type { ItemUndoStep } from '@/hooks/plan/item-undo-journal';
import { EMPTY_SELECTION, type Selection, type SelectionStore } from '@/lib/selection-store';
import { hasSelection, sameSelection, selectionWithin } from '@/lib/step-selection';

type SetState<T> = (value: T) => void;

// Undo / redo handlers plus the active-tab `tick`, lifted out of editor-page.tsx. Undo and redo are snapshot moves
// on the document history (useDocumentHistory). Each brings back the selection its step kept, once the tabs it
// restores are in, less what the step took away; each clears the editing and format-painter state. A person's own
// deselect is a step too, beside the canvas's, that leaves the redo side alone
// (docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo").
export function useEditorHistory(opts: {
  activeId: string;
  tabs: Tab[];
  editsBlocked: boolean;
  canUndo: boolean;
  canRedo: boolean;
  // A locked active tab pauses undo and redo on every route (toolbar, keyboard, command palette), so an
  // undo can't unlock the tab or roll it back past the lock (docs/specs/008-canvas/canvas-and-palette.md
  // "A locked tab pauses undo and redo").
  tabLocked: boolean;
  tickTabs: (updater: (tabs: Tab[]) => Tab[]) => void;
  // A canvas step's undo or redo returns the selection it kept (null: none); one beside the canvas, undefined.
  undoHistory: () => Selection | null | undefined;
  redoHistory: () => Selection | null | undefined;
  // Records a step beside the canvas's that leaves the redo side alone (useItemUndo).
  pushAside: (step: ItemUndoStep) => void;
  selection: SelectionStore;
  set: {
    setEditingId: SetState<string | null>;
    setFormatSourceId: SetState<string | null>;
  };
}) {
  const { activeId, tabs, editsBlocked, tabLocked, tickTabs, undoHistory, redoHistory } = opts;
  const { pushAside, selection, set } = opts;
  const canUndo = opts.canUndo && !tabLocked;
  const canRedo = opts.canRedo && !tabLocked;
  const { setEditingId, setFormatSourceId } = set;
  const live = useLatest({ tabs, activeId });

  // The selection a canvas step brings back, applied once its tabs are in (the tabs it was asked from have gone):
  // what the step took away is left out. Into the selection store, outside React state.
  const restoring = useRef<{ selection: Selection; from: Tab[] } | null>(null);
  useLayoutEffect(() => {
    const pending = restoring.current;
    if (!pending || pending.from === tabs) return;
    restoring.current = null;
    selection.setSelection(selectionWithin(pending.selection, tabs, activeId));
  }, [tabs, activeId, selection]);

  const tick = (mapElements: (els: Element[]) => Element[]) => {
    if (editsBlocked) return;
    tickTabs((ts) =>
      ts.map((t) => (t.id === activeId ? { ...t, elements: mapElements(t.elements) } : t)),
    );
  };

  const leaveEditing = () => {
    setEditingId(null);
    setFormatSourceId(null);
  };

  const bringBack = (kept: Selection | null | undefined) => {
    // A step beside the canvas's set the selection itself.
    if (kept === undefined) return;
    restoring.current = { selection: kept ?? EMPTY_SELECTION, from: live.current.tabs };
  };

  const undo = () => {
    if (!canUndo) return;
    track('Document', 'Undone');
    announce('Undid the last change');
    leaveEditing();
    bringBack(undoHistory());
  };

  const redo = () => {
    if (!canRedo) return;
    track('Document', 'Redone');
    announce('Redid the last change');
    leaveEditing();
    bringBack(redoHistory());
  };

  // This person cleared their selection (a press on empty canvas, Escape): a step of its own, so Undo brings the
  // selection back on its tab. Nothing selected, nothing to step. Undo passes over it once none of its elements is
  // left to select, and redo once nothing is selected to clear.
  const deselect = () => {
    const before = selection.get();
    if (!hasSelection(before)) return;
    const tabId = live.current.activeId;
    selection.setSelection(EMPTY_SELECTION);
    pushAside({
      undo: () => {
        if (live.current.activeId !== tabId) return false;
        const back = selectionWithin(before, live.current.tabs, tabId);
        if (!hasSelection(back) || sameSelection(back, selection.get())) return false;
        selection.setSelection(back);
        return true;
      },
      redo: () => {
        if (!hasSelection(selection.get())) return false;
        selection.setSelection(EMPTY_SELECTION);
        return true;
      },
    });
  };

  return { tick, undo, redo, deselect, canUndo, canRedo };
}
