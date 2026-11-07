// Which document the Explorer shows in its own place (docs/specs/013-workspace/new-document-menu.md "In the
// Explorer's place"): set by startNewDocument as it moves the address to /document/<id>, cleared once the editor may
// go. One at a time: opening another replaces it. Beside it, the standby: the document the
// editor is rendered for ahead, hidden, until a click opens it. Both change together, in one update, so the editor
// built for the standby is the one that opens, never unmounted in between.
import { startTransition, useEffect, useState } from 'react';

export type InPlaceDocuments = {
  // The document open in place, shown while the address names it.
  open: string | null;
  // The standby, rendered hidden while nothing is open.
  standby: string | null;
};

let current: InPlaceDocuments = { open: null, standby: null };
const listeners = new Set<() => void>();

const set = (next: InPlaceDocuments) => {
  current = next;
  for (const listener of listeners) listener();
};

// Opens a document in place; opening the standby takes it.
export function openInPlace(id: string): void {
  set({ open: id, standby: current.standby === id ? null : current.standby });
}

export function closeInPlace(id: string): void {
  if (current.open !== id) return;
  set({ ...current, open: null });
}

export function setStandbyInPlace(id: string | null): void {
  if (current.standby === id) return;
  set({ ...current, standby: id });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Followed as a transition: the editor mounts, or the standby is revealed, at a non-urgent priority, outside the
// click's own event. Its commit still mounts the editor's effects before the first frame: the measuring layout effects
// set state, and React runs the passive effects ahead of the render that follows (D204).
export function useInPlaceDocuments(): InPlaceDocuments {
  const [shown, setShown] = useState<InPlaceDocuments>(current);
  useEffect(() => {
    const follow = () => startTransition(() => setShown(current));
    follow();
    return subscribe(follow);
  }, []);
  return shown;
}
