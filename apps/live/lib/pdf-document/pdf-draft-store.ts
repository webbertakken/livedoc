'use client';

// A Drawing's stroke as it is drawn, both ways (docs/specs/035-pdf-documents/live-editing-and-storage.md "A mark as it
// is made"). Ours: the stroke in hand, put by the surface and sent by usePdfDraftBroadcast. Collaborators': each
// person's strokes by id, grown by the stretches that follow on, ignored where one is missed until a stroke begins at
// 0; kept after their end until the page's marks next change (the finished mark has arrived) or PDF_DRAFT_LINGER_MS,
// and let go once silent for PDF_DRAFT_STALE_MS. Held outside React, read per tab by the surface.
import { useSyncExternalStore } from 'react';
import type { PdfDraft, PdfDraftLook } from '@livedoc/api-schema';
import { PDF_DRAWING_MAX_POINTS } from '@livedoc/pdf-documents';

/** (default) How long a stroke stays after its end, at most: the finished mark arrives well within it. */
export const PDF_DRAFT_LINGER_MS = 1_000;
/** (default) How long a stroke stays silent before its drawer is taken as gone. */
export const PDF_DRAFT_STALE_MS = 5_000;

// --- Ours ----------------------------------------------------------------------------------------

/** The stroke in hand: its tab and page, its own id, its look and its points so far, flat `x, y`. */
export type PdfLocalDraft = {
  readonly tabId: string;
  readonly page: string;
  readonly stroke: string;
  readonly look: PdfDraftLook;
  readonly points: readonly number[];
};

let local: PdfLocalDraft | null = null;
const localListeners = new Set<() => void>();

/** The stroke in hand, or (null) none: ended or let go. */
export function setLocalPdfDraft(draft: PdfLocalDraft | null): void {
  if (draft === local) return;
  local = draft;
  for (const listener of localListeners) listener();
}

export function getLocalPdfDraft(): PdfLocalDraft | null {
  return local;
}

export function subscribeLocalPdfDraft(listener: () => void): () => void {
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

// --- Collaborators' ------------------------------------------------------------------------------

/** A collaborator's stroke as it is drawn. */
export type PdfPeerDraft = {
  readonly person: string;
  readonly stroke: string;
  readonly page: string;
  readonly look: PdfDraftLook;
  readonly points: readonly number[];
};

type Held = PdfPeerDraft & { tabId: string; heardAt: number; endedAt: number | null };

const drafts = new Map<string, Held>();
const listeners = new Set<() => void>();
let snapshots = new Map<string, readonly PdfPeerDraft[]>();
let sweep: ReturnType<typeof setTimeout> | null = null;

const keyOf = (person: string, stroke: string) => `${person} ${stroke}`;

/** When a held stroke is let go by time: its end's linger, or its silence. */
const deadline = (held: Held): number =>
  held.endedAt === null ? held.heardAt + PDF_DRAFT_STALE_MS : held.endedAt + PDF_DRAFT_LINGER_MS;

function tell(): void {
  snapshots = new Map();
  for (const listener of [...listeners]) listener();
}

/** Lets go of what is past its time, and waits for the next. */
function sweepNow(): void {
  sweep = null;
  const now = Date.now();
  let changed = false;
  for (const [key, held] of drafts)
    if (deadline(held) <= now) changed = drafts.delete(key) || changed;
  schedule();
  if (changed) tell();
}

function schedule(): void {
  if (sweep) clearTimeout(sweep);
  sweep = null;
  if (drafts.size === 0) return;
  const next = Math.min(...[...drafts.values()].map(deadline));
  sweep = setTimeout(sweepNow, Math.max(0, next - Date.now()));
}

/** A collaborator's `pdf-draft` op: a stroke begun, grown, or (points null) ended. */
export function receivePdfDraft(person: string, draft: PdfDraft): void {
  const key = keyOf(person, draft.stroke);
  const was = drafts.get(key);
  const now = Date.now();
  if (draft.points === null) {
    if (!was || was.endedAt !== null) return;
    drafts.set(key, { ...was, endedAt: now });
  } else if (draft.from === 0) {
    drafts.set(key, {
      person,
      stroke: draft.stroke,
      tabId: draft.tabId,
      page: draft.page,
      look: draft.look,
      points: draft.points,
      heardAt: now,
      endedAt: null,
    });
  } else {
    if (!was || was.endedAt !== null) return;
    // A stretch that misses what came before: the stroke is let go until one begins at 0.
    if (draft.from !== was.points.length / 2 || draft.tabId !== was.tabId) drafts.delete(key);
    else if (was.points.length / 2 >= PDF_DRAWING_MAX_POINTS) return;
    else drafts.set(key, { ...was, points: [...was.points, ...draft.points], heardAt: now });
  }
  schedule();
  tell();
}

/** The marks of `tabId` changed: the strokes ended there have their finished marks now. */
export function settlePdfDrafts(tabId: string): void {
  let changed = false;
  for (const [key, held] of drafts)
    if (held.tabId === tabId && held.endedAt !== null) changed = drafts.delete(key) || changed;
  if (!changed) return;
  schedule();
  tell();
}

/** A person left the tab or the room: their strokes go with them. */
export function forgetPdfDrafts(person: string): void {
  let changed = false;
  for (const [key, held] of drafts)
    if (held.person === person) changed = drafts.delete(key) || changed;
  if (!changed) return;
  schedule();
  tell();
}

/** The room's people: the strokes of anyone no longer in it go. */
export function syncPdfDraftPeople(present: ReadonlySet<string>): void {
  for (const person of new Set([...drafts.values()].map((held) => held.person)))
    if (!present.has(person)) forgetPdfDrafts(person);
}

/** The room closed: no stroke stays. */
export function resetPdfDrafts(): void {
  if (drafts.size === 0) return;
  drafts.clear();
  schedule();
  tell();
}

const NONE: readonly PdfPeerDraft[] = [];

/** The collaborators' strokes on `tabId`, the same list until one of them changes. */
export function pdfDraftsOf(tabId: string): readonly PdfPeerDraft[] {
  const kept = snapshots.get(tabId);
  if (kept) return kept;
  const out = [...drafts.values()]
    .filter((held) => held.tabId === tabId)
    .map(({ person, stroke, page, look, points }) => ({ person, stroke, page, look, points }));
  const list = out.length === 0 ? NONE : out;
  snapshots.set(tabId, list);
  return list;
}

export function subscribePdfDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePdfDraftPeers(tabId: string): readonly PdfPeerDraft[] {
  return useSyncExternalStore(
    subscribePdfDrafts,
    () => pdfDraftsOf(tabId),
    () => NONE,
  );
}

export function resetPdfDraftsForTests(): void {
  drafts.clear();
  if (sweep) clearTimeout(sweep);
  sweep = null;
  snapshots = new Map();
  listeners.clear();
  local = null;
  localListeners.clear();
}
