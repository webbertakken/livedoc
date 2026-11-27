'use client';

// Carets in a text document, both ways (docs/specs/034-text-documents/live-editing-and-storage.md "Presence"). Ours:
// where this person's selection is, published by the surface and sent to the room (useTextDocumentCaretBroadcast).
// Collaborators': each one's selection from their `text-document-caret` ops, named and coloured from the room's
// presence list (useRoomConnection), read per tab by the surface that draws them. No Yjs here: positions stay base64
// until the surface resolves them, so the editor's first load carries none of the model.
import { useSyncExternalStore } from 'react';
import type { TextDocumentCaret } from '@livedoc/api-schema';

/** (default) How long a collaborator's caret shows their name after it moves. */
export const TEXT_DOCUMENT_CARET_FRESH_MS = 1500;

/** A selection by its relative positions, base64. */
export type TextDocumentSelection = { anchor: string; head: string };

// --- Ours ----------------------------------------------------------------------------------------

type LocalCaret = ({ tabId: string } & TextDocumentSelection) | null;

let local: LocalCaret = null;
const localListeners = new Set<() => void>();

/** This person's selection in `tabId`'s writing, or (null) gone from it. */
export function setLocalTextDocumentCaret(
  tabId: string,
  selection: TextDocumentSelection | null,
): void {
  if (!selection) {
    if (local?.tabId !== tabId) return;
    local = null;
  } else {
    if (
      local?.tabId === tabId &&
      local.anchor === selection.anchor &&
      local.head === selection.head
    )
      return;
    local = { tabId, ...selection };
  }
  for (const l of localListeners) l();
}

export function getLocalTextDocumentCaret(): LocalCaret {
  return local;
}

export function subscribeLocalTextDocumentCaret(l: () => void): () => void {
  localListeners.add(l);
  return () => {
    localListeners.delete(l);
  };
}

// --- Collaborators' ------------------------------------------------------------------------------

export type TextDocumentPeer = {
  /** The collaborator's presence id. */
  id: string;
  name: string;
  color: string;
  anchor: string;
  head: string;
  /** Moved within the last TEXT_DOCUMENT_CARET_FRESH_MS: their name shows. */
  fresh: boolean;
};

type Held = { tabId: string; anchor: string; head: string; fresh: boolean };

const carets = new Map<string, Held>();
const people = new Map<string, { name: string; color: string }>();
const freshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const peerListeners = new Set<() => void>();
let snapshots = new Map<string, readonly TextDocumentPeer[]>();
const NONE: readonly TextDocumentPeer[] = [];

function emitPeers(): void {
  snapshots = new Map();
  for (const l of peerListeners) l();
}

function forget(id: string): boolean {
  const timer = freshTimers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  freshTimers.delete(id);
  return carets.delete(id);
}

/** A collaborator's `text-document-caret` op: their selection moved, or (anchor null) left the writing. */
export function receiveTextDocumentCaret(from: string, caret: TextDocumentCaret): void {
  if (caret.anchor === null) {
    if (forget(from)) emitPeers();
    return;
  }
  const was = carets.get(from);
  if (was && was.tabId === caret.tabId && was.anchor === caret.anchor && was.head === caret.head)
    return;
  const timer = freshTimers.get(from);
  if (timer !== undefined) clearTimeout(timer);
  freshTimers.set(
    from,
    setTimeout(() => {
      freshTimers.delete(from);
      const held = carets.get(from);
      if (!held) return;
      carets.set(from, { ...held, fresh: false });
      emitPeers();
    }, TEXT_DOCUMENT_CARET_FRESH_MS),
  );
  carets.set(from, { tabId: caret.tabId, anchor: caret.anchor, head: caret.head, fresh: true });
  emitPeers();
}

/** The room's presence list: names and colours; the carets of anyone who left go with them. */
export function syncTextDocumentPeople(
  participants: readonly { id: string; name: string; color: string }[],
): void {
  let changed = false;
  const present = new Set<string>();
  for (const p of participants) {
    present.add(p.id);
    const was = people.get(p.id);
    if (was?.name === p.name && was.color === p.color) continue;
    people.set(p.id, { name: p.name, color: p.color });
    changed ||= carets.has(p.id);
  }
  for (const id of [...people.keys()]) if (!present.has(id)) people.delete(id);
  for (const id of [...carets.keys()]) if (!present.has(id)) changed = forget(id) || changed;
  if (changed) emitPeers();
}

/** A person in the room by their presence id: their name and colour, or null once they have left. */
export function textDocumentPersonOf(id: string): { name: string; color: string } | null {
  return people.get(id) ?? null;
}

/** The room closed: nobody's caret stays. */
export function resetTextDocumentPeers(): void {
  for (const id of [...carets.keys()]) forget(id);
  people.clear();
  emitPeers();
}

/** The collaborators' carets in `tabId`'s writing, the ones known by name. */
export function textDocumentPeersOf(tabId: string): readonly TextDocumentPeer[] {
  const kept = snapshots.get(tabId);
  if (kept) return kept;
  const out: TextDocumentPeer[] = [];
  for (const [id, c] of carets) {
    const person = people.get(id);
    if (c.tabId !== tabId || !person) continue;
    out.push({ id, ...person, anchor: c.anchor, head: c.head, fresh: c.fresh });
  }
  const list = out.length ? out : NONE;
  snapshots.set(tabId, list);
  return list;
}

function subscribePeers(l: () => void): () => void {
  peerListeners.add(l);
  return () => {
    peerListeners.delete(l);
  };
}

export function useTextDocumentPeers(tabId: string): readonly TextDocumentPeer[] {
  return useSyncExternalStore(
    subscribePeers,
    () => textDocumentPeersOf(tabId),
    () => NONE,
  );
}

export function resetTextDocumentCaretsForTests(): void {
  resetTextDocumentPeers();
  local = null;
}
