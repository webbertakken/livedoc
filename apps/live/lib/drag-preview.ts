'use client';

// The drag preview (docs/specs/008-canvas/drag-preview.md): what a move, resize or reshape would make
// of the elements it touches, drawn in place of them while the gesture lasts, without writing the
// document. One local preview (ours) and one per collaborator mid-drag, merged for drawing; the
// local one wins on an element both touch.

import { useSyncExternalStore } from 'react';
import type { Element } from '@livedoc/document';
import { createListeners } from '@/lib/listeners';

export type DragOverlay = {
  tabId: string;
  changed: ReadonlyMap<string, Element>;
  removed: ReadonlySet<string>;
  added: readonly { el: Element; after: string | null }[];
};

// A collaborator's preview: the geometry patches they sent, resolved against the elements being drawn
// at read time, so the rest of each element is ours as it is now.
type PeerPatch = { id: string } & Record<string, unknown>;

let local: DragOverlay | null = null;
// What an offered change would make of the board (a suggested reword, kind or name a person points at): drawn as a
// drag is, beneath every drag, but nobody's gesture, so it is never sent and never a note in hand.
let offered: DragOverlay | null = null;
const peers = new Map<string, { tabId: string; patches: readonly PeerPatch[] }>();
// One merged preview per tab and per element list a reader draws (Canvas and the element layer read
// different lists): a reader must get the same object back until something changes, or
// useSyncExternalStore re-renders it forever.
let merged = new Map<string, WeakMap<readonly Element[], DragOverlay | null>>();
const listeners = createListeners();

function changedNow(): void {
  merged = new Map();
  listeners.notify();
}

// The overlay that turns `doc` into `next`, by identity: one linear pass per tick.
export function overlayBetween(
  tabId: string,
  next: readonly Element[],
  doc: readonly Element[],
): DragOverlay {
  const before = new Map(doc.map((el) => [el.id, el] as const));
  const changed = new Map<string, Element>();
  const added: { el: Element; after: string | null }[] = [];
  const present = new Set<string>();
  next.forEach((el, i) => {
    present.add(el.id);
    const was = before.get(el.id);
    if (!was) added.push({ el, after: i > 0 ? next[i - 1]!.id : null });
    else if (was !== el) changed.set(el.id, el);
  });
  const removed = new Set(doc.filter((el) => !present.has(el.id)).map((el) => el.id));
  return { tabId, changed, removed, added };
}

export function setLocalPreview(
  tabId: string,
  next: readonly Element[],
  doc: readonly Element[],
): void {
  local = overlayBetween(tabId, next, doc);
  changedNow();
}

// How our last preview ended: written to the document (`landed`) or dropped (`cancelled`), for the
// end message collaborators get.
let lastEnding: 'landed' | 'cancelled' = 'cancelled';

export function clearLocalPreview(how: 'landed' | 'cancelled' = 'cancelled'): void {
  if (local === null) return;
  local = null;
  lastEnding = how;
  changedNow();
}

export function localPreviewEnding(): 'landed' | 'cancelled' {
  return lastEnding;
}

export function localPreview(): DragOverlay | null {
  return local;
}

/** Draw `next` in place of `doc` on the tab, as an offer a person is looking at; nothing is written or sent. */
export function setOfferedPreview(
  tabId: string,
  next: readonly Element[],
  doc: readonly Element[],
): void {
  const overlay = overlayBetween(tabId, next, doc);
  const empty =
    overlay.changed.size === 0 && overlay.removed.size === 0 && overlay.added.length === 0;
  if (empty && offered === null) return;
  offered = empty ? null : overlay;
  changedNow();
}

export function clearOfferedPreview(): void {
  if (offered === null) return;
  offered = null;
  changedNow();
}

export function setPeerPreview(
  presenceId: string,
  tabId: string,
  patches: readonly PeerPatch[],
): void {
  peers.set(presenceId, { tabId, patches });
  changedNow();
}

export function clearPeerPreview(presenceId: string): void {
  if (peers.delete(presenceId)) changedNow();
}

export function peerPreviewIds(): string[] {
  return [...peers.keys()];
}

// The elements with the overlay laid over them: changed elements replaced (only where they still
// exist), removed dropped, added inserted after their neighbour, or at the end when it is gone.
export function applyOverlay(elements: readonly Element[], overlay: DragOverlay): Element[] {
  const out: Element[] = [];
  const pending = new Map<string | null, Element[]>();
  for (const { el, after } of overlay.added)
    pending.set(after, [...(pending.get(after) ?? []), el]);
  const drain = (key: string | null) => {
    const queue = pending.get(key);
    if (!queue) return;
    pending.delete(key);
    for (const el of queue) {
      out.push(el);
      drain(el.id);
    }
  };
  drain(null);
  for (const el of elements) {
    if (overlay.removed.has(el.id)) continue;
    out.push(overlay.changed.get(el.id) ?? el);
    drain(el.id);
  }
  for (const key of [...pending.keys()]) drain(key);
  return out;
}

// `top` laid over `base`: what either changes, removes or adds, `top` winning on an element both change.
function over(base: DragOverlay, top: DragOverlay): DragOverlay {
  return {
    tabId: top.tabId,
    changed: new Map([...base.changed, ...top.changed]),
    removed: new Set([...base.removed, ...top.removed]),
    added: [...base.added, ...top.added],
  };
}

// Every preview for a tab, merged: an offer at the bottom, collaborators' patches resolved against `elements` (ids
// it lacks are skipped) over it, then our drag over them.
function mergedFor(tabId: string, elements: readonly Element[]): DragOverlay | null {
  let forTab = merged.get(tabId);
  if (!forTab) {
    forTab = new WeakMap();
    merged.set(tabId, forTab);
  }
  if (forTab.has(elements)) return forTab.get(elements)!;
  const theirs = [...peers.values()].filter((p) => p.tabId === tabId && p.patches.length > 0);
  const drag = local && local.tabId === tabId ? local : null;
  const offer = offered && offered.tabId === tabId ? offered : null;
  const ours = drag && offer ? over(offer, drag) : (drag ?? offer);
  let overlay: DragOverlay | null = ours;
  if (theirs.length > 0) {
    const byId = new Map(elements.map((el) => [el.id, el] as const));
    const changed = new Map<string, Element>(offer?.changed);
    for (const p of theirs)
      for (const patch of p.patches) {
        const base = byId.get(patch.id);
        if (base) changed.set(patch.id, { ...base, ...patch });
      }
    if (drag) for (const [id, el] of drag.changed) changed.set(id, el);
    overlay =
      changed.size || ours
        ? { tabId, changed, removed: ours?.removed ?? new Set(), added: ours?.added ?? [] }
        : null;
  }
  forTab.set(elements, overlay);
  return overlay;
}

// Called on every change to any preview (the drag hook writes one per frame).
export const subscribeDragPreview = listeners.subscribe;

// The tab's merged preview for drawing `elements`, read outside React (a store deriving from it on each
// change); null when nobody is dragging there. The same object until something changes.
export function dragPreviewFor(tabId: string, elements: readonly Element[]): DragOverlay | null {
  return mergedFor(tabId, elements);
}

// The tab's merged preview, for drawing `elements`; null when nobody is dragging there.
export function useDragPreview(tabId: string, elements: readonly Element[]): DragOverlay | null {
  return useSyncExternalStore(
    subscribeDragPreview,
    () => mergedFor(tabId, elements),
    () => null,
  );
}

export function resetDragPreviewForTests(): void {
  local = null;
  offered = null;
  peers.clear();
  changedNow();
  listeners.clear();
}

// This person's own preview on the tab, as a store React reads (never `localPreview()` during render, which the
// React Compiler would hold at its first value); null while they drag nothing there.
export function useLocalDragPreview(tabId: string): DragOverlay | null {
  return useSyncExternalStore(
    subscribeDragPreview,
    () => (local && local.tabId === tabId ? local : null),
    () => null,
  );
}
