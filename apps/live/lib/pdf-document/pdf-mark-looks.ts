// Each text tool's look (docs/specs/035-pdf-documents/marks.md "Making a mark": The tool's look is remembered), one
// person's, kept in their browser for every PDF: the colour chosen for a kind over the kind's first look. A stored
// value that is no colour, or a kind that is none, is passed over as if nothing were kept.
import { useSyncExternalStore } from 'react';
import { MARK_KINDS, type TextMarkKind } from '@livedoc/pdf-documents';
import { createListeners } from '@/lib/listeners';
import { readLocalStorageSafe, writeLocalStorageSafe } from '@/lib/local-storage-safe';
import { TEXT_MARK_LOOKS, type TextMarkLook } from './pdf-text-mark';

export type TextMarkLooks = Readonly<Record<TextMarkKind, TextMarkLook>>;

const LOOKS_KEY = 'livedoc:v2:pdf-mark-looks';
const COLOUR = /^#[0-9a-f]{6}$/;

let colours: Partial<Record<TextMarkKind, string>> | null = null;
let looks: TextMarkLooks | null = null;
const listeners = createListeners();

// The colours kept, by kind; anything else kept is let go.
function kept(): Partial<Record<TextMarkKind, string>> {
  try {
    const raw: unknown = JSON.parse(readLocalStorageSafe(LOOKS_KEY) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return {};
    const entries = Object.entries(raw as Record<string, unknown>);
    return Object.fromEntries(
      entries.filter(
        ([kind, colour]) =>
          MARK_KINDS.includes(kind as TextMarkKind) &&
          typeof colour === 'string' &&
          COLOUR.test(colour),
      ),
    );
  } catch {
    return {};
  }
}

const withColours = (colours: Partial<Record<TextMarkKind, string>>): TextMarkLooks =>
  Object.fromEntries(
    MARK_KINDS.map((kind) => [
      kind,
      { ...TEXT_MARK_LOOKS[kind], ...(colours[kind] ? { colour: colours[kind] } : {}) },
    ]),
  ) as unknown as TextMarkLooks;

export function textMarkLooks(): TextMarkLooks {
  colours ??= kept();
  looks ??= withColours(colours);
  return looks;
}

/** A kind's colour chosen, `#rrggbb`; null returns it to the kind's first look. */
export function setTextMarkColour(kind: TextMarkKind, colour: string | null): void {
  const chosen = colour?.toLowerCase() ?? null;
  if (chosen !== null && !COLOUR.test(chosen)) return;
  const next = { ...(colours ?? kept()) };
  if (chosen === null) delete next[kind];
  else next[kind] = chosen;
  colours = next;
  looks = withColours(next);
  // A blocked write keeps the look for this page only.
  writeLocalStorageSafe(LOOKS_KEY, JSON.stringify(next));
  listeners.notify();
}

export function useTextMarkLooks(): TextMarkLooks {
  return useSyncExternalStore(listeners.subscribe, textMarkLooks, () => TEXT_MARK_LOOKS);
}

// For tests: forget the looks read so far.
export function resetTextMarkLooks(): void {
  colours = null;
  looks = null;
}
