'use client';

// Where people are in a PDF document, both ways (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence").
// Ours: the page in view, the editing mode and what is held, published by the surface of the tab this person is on
// and sent to the room (usePdfPresenceBroadcast). Collaborators': each one's place from their `pdf-presence` ops,
// named and coloured from the room's presence list (useRoomConnection), read per tab by the surface. Names stay the
// wire's tokens here: the surface finds them in its own file, so the editor's first load carries none of the engine.
import { useSyncExternalStore } from 'react';
import type { PdfPresence, PdfPresenceHeld, PdfPresenceMode } from '@livedoc/api-schema';
import { liveTabPeers, type LiveTabPeer, type LiveTabPerson } from '@/lib/live-tab/live-tab-peers';

/** (default) How long a collaborator's name shows over what they hold after it moves: a text document's caret label. */
export const PDF_PRESENCE_FRESH_MS = 3_000;

/** A person's place in a PDF document: the page in view by its name, their editing mode, at most one thing held. */
export type PdfPlace = { page: string; mode: PdfPresenceMode; held: PdfPresenceHeld | null };

export type PdfPresencePeer = LiveTabPeer<PdfPlace>;

const samePlace = (a: PdfPlace, b: PdfPlace): boolean =>
  a.page === b.page && a.mode === b.mode && JSON.stringify(a.held) === JSON.stringify(b.held);

// --- Ours ----------------------------------------------------------------------------------------

type LocalPlace = ({ tabId: string } & PdfPlace) | null;

let local: LocalPlace = null;
const localListeners = new Set<() => void>();

const tellLocal = (): void => {
  for (const listener of localListeners) listener();
};

/** This person's place in `tabId`'s PDF, or (null) gone from it. */
export function setLocalPdfPresence(tabId: string, place: PdfPlace | null): void {
  if (!place) {
    if (local?.tabId !== tabId) return;
    local = null;
  } else {
    if (local?.tabId === tabId && samePlace(local, place)) return;
    local = { tabId, ...place };
  }
  tellLocal();
}

export function getLocalPdfPresence(): LocalPlace {
  return local;
}

export function subscribeLocalPdfPresence(listener: () => void): () => void {
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

// --- Collaborators' ------------------------------------------------------------------------------

// "Whoever joins hears where everyone is": the room keeps no presence, so a join has our place said again.
const peers = liveTabPeers<PdfPlace>({ same: samePlace, onJoined: tellLocal });

/** A collaborator's `pdf-presence` op: their place moved, or (page null) they left the tab. */
export function receivePdfPresence(from: string, presence: PdfPresence): void {
  if (presence.page === null) peers.forget(from);
  else
    peers.receive(from, presence.tabId, {
      page: presence.page,
      mode: presence.mode,
      held: presence.held,
    });
}

/** The room's presence list: names and colours; whoever left takes their place with them. */
export function syncPdfPresencePeople(participants: readonly LiveTabPerson[]): void {
  peers.syncPeople(participants);
}

/** The room closed: nobody's place stays. */
export function resetPdfPresencePeers(): void {
  peers.reset();
}

/** The collaborators in `tabId`'s PDF, the ones known by name. */
export function pdfPresencePeersOf(tabId: string): readonly PdfPresencePeer[] {
  return peers.of(tabId);
}

const NOBODY: readonly PdfPresencePeer[] = [];

export function usePdfPresencePeers(tabId: string): readonly PdfPresencePeer[] {
  return useSyncExternalStore(
    peers.subscribe,
    () => peers.of(tabId),
    () => NOBODY,
  );
}

export function resetPdfPresenceForTests(): void {
  peers.reset();
  local = null;
  localListeners.clear();
}
