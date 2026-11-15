'use client';

import { useSyncExternalStore } from 'react';
import type { ElementId } from '@livedoc/document';

// The board's structure as one person is working on it (docs/specs/021-event-storming/board-structure.md "Hotspot
// answers"): which hotspot's answer is open for typing. The person's own view: never shared or saved, and closed
// whenever another board is looked at. Module-level, because a note's menu, the check on the note and the Review
// panel's Answer all open the one field, from different parts of the tree.

export type StructureView = {
  tabId: string | null;
  // The hotspot whose answer is open for typing.
  answeringId: ElementId | null;
};

let view: StructureView = { tabId: null, answeringId: null };
const listeners = new Set<() => void>();

function publish(next: StructureView): void {
  view = next;
  for (const l of listeners) l();
}

/** The view for this board: nothing open when the stored view is another board's. */
export function structureViewFor(tabId: string): StructureView {
  return view.tabId === tabId ? view : { tabId, answeringId: null };
}

export function openAnswer(tabId: string, id: ElementId): void {
  publish({ tabId, answeringId: id });
}

export function closeAnswer(tabId: string): void {
  if (structureViewFor(tabId).answeringId !== null) publish({ tabId, answeringId: null });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const SERVER_VIEW: StructureView = { tabId: null, answeringId: null };

export function useStructureView(tabId: string): StructureView {
  const stored = useSyncExternalStore(
    subscribe,
    () => view,
    () => SERVER_VIEW,
  );
  return stored.tabId === tabId ? stored : structureViewFor(tabId);
}

export function resetStructureViewForTests(): void {
  view = { tabId: null, answeringId: null };
}
