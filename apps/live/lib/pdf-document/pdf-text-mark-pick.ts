// The text tool the toolbar's Highlight holds (docs/specs/035-pdf-documents/reading-surface.md "The toolbar"): the last
// of Highlight, Underline and Strikethrough a person took from it, kept in their browser for every PDF; Highlight
// until they take another.
import { useSyncExternalStore } from 'react';
import type { TextMarkKind } from '@livedoc/pdf-documents';
import { createListeners } from '@/lib/listeners';
import { readLocalStorageSafe, writeLocalStorageSafe } from '@/lib/local-storage-safe';

/** The tools behind the Highlight control's chevron, in its order. */
export const HELD_TEXT_MARKS = [
  'highlight',
  'underline',
  'strikeout',
] as const satisfies readonly TextMarkKind[];
export type HeldTextMark = (typeof HELD_TEXT_MARKS)[number];

const PICK_KEY = 'livedoc:v2:pdf-text-mark-tool';
const FIRST: HeldTextMark = 'highlight';

let pick: HeldTextMark | null = null;
const listeners = createListeners();

export const isHeldTextMark = (kind: string): kind is HeldTextMark =>
  (HELD_TEXT_MARKS as readonly string[]).includes(kind);

// No storage, or a value that is none of them: Highlight.
function read(): HeldTextMark {
  const raw = readLocalStorageSafe(PICK_KEY) ?? '';
  return isHeldTextMark(raw) ? raw : FIRST;
}

export function textMarkPick(): HeldTextMark {
  pick ??= read();
  return pick;
}

export function setTextMarkPick(kind: HeldTextMark): void {
  if (kind === textMarkPick()) return;
  pick = kind;
  // A blocked write keeps the pick for this page only.
  writeLocalStorageSafe(PICK_KEY, kind);
  listeners.notify();
}

export function useTextMarkPick(): HeldTextMark {
  return useSyncExternalStore(listeners.subscribe, textMarkPick, () => FIRST);
}

// For tests: forget the pick read so far.
export function resetTextMarkPick(): void {
  pick = null;
}
