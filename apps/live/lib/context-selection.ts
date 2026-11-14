'use client';

import { useSyncExternalStore } from 'react';

// Which candidate contexts this person has selected, the one whose name is open for typing, and whether the pen that
// draws a new one is armed
// (docs/specs/021-event-storming/candidate-contexts.md "Selecting several and merging"). The person's own view:
// never shared or saved, and empty whenever another board is looked at. Module-level, because the outlines, the
// merge offer and the layer that clears it all read it from different parts of the tree.

export type ContextSelection = {
  tabId: string | null;
  ids: ReadonlySet<string>;
  editingId: string | null;
  // Draw Context's one-shot pen (candidate-contexts.md "Making one by hand").
  drawing: boolean;
};

const EMPTY: ReadonlySet<string> = new Set();
let selection: ContextSelection = { tabId: null, ids: EMPTY, editingId: null, drawing: false };
const listeners = new Set<() => void>();

function publish(next: ContextSelection): void {
  selection = next;
  for (const l of listeners) l();
}

export function contextSelectionFor(tabId: string): ContextSelection {
  return selection.tabId === tabId
    ? selection
    : { tabId, ids: EMPTY, editingId: null, drawing: false };
}

/** Select one context alone, or with `add` toggle it in or out of the selection. */
export function selectContext(tabId: string, id: string, add = false): void {
  const now = contextSelectionFor(tabId);
  const ids = new Set(add ? now.ids : []);
  if (add && ids.has(id)) ids.delete(id);
  else ids.add(id);
  publish({ tabId, ids, editingId: null, drawing: false });
}

export function clearContextSelection(tabId: string): void {
  const now = contextSelectionFor(tabId);
  if (now.ids.size === 0 && now.editingId === null && !now.drawing) return;
  publish({ tabId, ids: EMPTY, editingId: null, drawing: false });
}

/** Open a context's name for typing (null closes it), selecting it alone. */
export function editContextName(tabId: string, id: string | null): void {
  publish({
    tabId,
    ids: id ? new Set([id]) : contextSelectionFor(tabId).ids,
    editingId: id,
    drawing: false,
  });
}

/** Arm or put away the pen that draws a new context; arming it lets go of any selected context. */
export function setDrawingContext(tabId: string, drawing: boolean): void {
  publish({ tabId, ids: EMPTY, editingId: null, drawing });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useContextSelection(tabId: string): ContextSelection {
  const stored = useSyncExternalStore(
    subscribe,
    () => selection,
    () => selection,
  );
  return stored.tabId === tabId ? stored : { tabId, ids: EMPTY, editingId: null, drawing: false };
}

export function resetContextSelectionForTests(): void {
  selection = { tabId: null, ids: EMPTY, editingId: null, drawing: false };
}
