// The other people on a live tab, each with their place in it (docs/specs/006-document/kinds-outside-the-canvas.md
// "Live state"): a kind's presence op says where a collaborator is, the room's presence list says who they are and
// that they are still here. Held outside React, read per tab by the surface that draws them. What a place is, is the
// kind's own.

export type LiveTabPerson = { id: string; name: string; color: string };

export type LiveTabPeer<Place> = LiveTabPerson & { place: Place };

export type LiveTabPeers<Place> = {
  /** A collaborator's place on `tabId` moved. */
  receive: (from: string, tabId: string, place: Place) => void;
  /** A collaborator left the tab they were on. */
  forget: (from: string) => void;
  /** The room's presence list: names and colours; the places of anyone who left go with them. */
  syncPeople: (participants: readonly LiveTabPerson[]) => void;
  /** The room closed: nobody's place stays. */
  reset: () => void;
  /** The collaborators on `tabId`, the ones known by name; the same list until one of them changes. */
  of: (tabId: string) => readonly LiveTabPeer<Place>[];
  subscribe: (listener: () => void) => () => void;
};

const NOBODY: readonly never[] = [];

/** `same` tells two places apart; `onJoined` hears that the presence list holds someone it did not before. */
export function liveTabPeers<Place>(options: {
  same: (a: Place, b: Place) => boolean;
  onJoined?: () => void;
}): LiveTabPeers<Place> {
  const places = new Map<string, { tabId: string; place: Place }>();
  const people = new Map<string, { name: string; color: string }>();
  const listeners = new Set<() => void>();
  let snapshots = new Map<string, readonly LiveTabPeer<Place>[]>();

  const emit = (): void => {
    snapshots = new Map();
    for (const listener of listeners) listener();
  };

  return {
    receive(from, tabId, place) {
      const was = places.get(from);
      if (was && was.tabId === tabId && options.same(was.place, place)) return;
      places.set(from, { tabId, place });
      emit();
    },
    forget(from) {
      if (places.delete(from)) emit();
    },
    syncPeople(participants) {
      let changed = false;
      let joined = false;
      const present = new Set<string>();
      for (const person of participants) {
        present.add(person.id);
        const was = people.get(person.id);
        joined ||= !was;
        if (was?.name === person.name && was.color === person.color) continue;
        people.set(person.id, { name: person.name, color: person.color });
        changed ||= places.has(person.id);
      }
      for (const id of [...people.keys()]) if (!present.has(id)) people.delete(id);
      for (const id of [...places.keys()])
        if (!present.has(id)) changed = places.delete(id) || changed;
      if (changed) emit();
      if (joined) options.onJoined?.();
    },
    reset() {
      places.clear();
      people.clear();
      emit();
    },
    of(tabId) {
      const kept = snapshots.get(tabId);
      if (kept) return kept;
      const out: LiveTabPeer<Place>[] = [];
      for (const [id, held] of places) {
        const person = people.get(id);
        if (held.tabId === tabId && person) out.push({ id, ...person, place: held.place });
      }
      const list = out.length ? out : NOBODY;
      snapshots.set(tabId, list);
      return list;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
