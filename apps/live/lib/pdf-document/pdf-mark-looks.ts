// Each mark tool's look (docs/specs/035-pdf-documents/marks.md "Making a mark": The tool's look is remembered), one
// person's, kept in their browser for every PDF: the colour chosen for a kind over the kind's first look. A stored
// value that is no colour, or a kind that is none, is passed over as if nothing were kept.
import { useSyncExternalStore } from 'react';
import { MARK_KINDS, type MarkKind } from '@livedoc/pdf-documents';
import { createListeners } from '@/lib/listeners';
import { readLocalStorageSafe, writeLocalStorageSafe } from '@/lib/local-storage-safe';
import { DRAWING_LOOK } from './pdf-drawing';
import { SHAPE_LOOK } from './pdf-shape';
import { TEXT_MARK_LOOKS, type TextMarkLook } from './pdf-text-mark';
import { TYPED_LOOK } from './pdf-typed';

export type MarkLooks = Readonly<Record<MarkKind, TextMarkLook>>;

/** Each kind's first look, before a person chooses another (marks.md "Making a mark"). */
export const FIRST_LOOKS: MarkLooks = {
  ...TEXT_MARK_LOOKS,
  drawing: DRAWING_LOOK,
  line: SHAPE_LOOK,
  arrow: SHAPE_LOOK,
  rectangle: SHAPE_LOOK,
  ellipse: SHAPE_LOOK,
  text: TYPED_LOOK,
  callout: TYPED_LOOK,
};

const LOOKS_KEY = 'livedoc:v2:pdf-mark-looks';
const COLOUR = /^#[0-9a-f]{6}$/;

let colours: Partial<Record<MarkKind, string>> | null = null;
let looks: MarkLooks | null = null;
const listeners = createListeners();

// The colours kept, by kind; anything else kept is let go.
function kept(): Partial<Record<MarkKind, string>> {
  try {
    const raw: unknown = JSON.parse(readLocalStorageSafe(LOOKS_KEY) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return {};
    const entries = Object.entries(raw as Record<string, unknown>);
    return Object.fromEntries(
      entries.filter(
        ([kind, colour]) =>
          MARK_KINDS.includes(kind as MarkKind) &&
          typeof colour === 'string' &&
          COLOUR.test(colour),
      ),
    );
  } catch {
    return {};
  }
}

const withColours = (colours: Partial<Record<MarkKind, string>>): MarkLooks =>
  Object.fromEntries(
    MARK_KINDS.map((kind) => [
      kind,
      { ...FIRST_LOOKS[kind], ...(colours[kind] ? { colour: colours[kind] } : {}) },
    ]),
  ) as unknown as MarkLooks;

export function markLooks(): MarkLooks {
  colours ??= kept();
  looks ??= withColours(colours);
  return looks;
}

/** A kind's colour chosen, `#rrggbb`; null returns it to the kind's first look. */
export function setMarkColour(kind: MarkKind, colour: string | null): void {
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

export function useMarkLooks(): MarkLooks {
  return useSyncExternalStore(listeners.subscribe, markLooks, () => FIRST_LOOKS);
}

// For tests: forget the looks read so far.
export function resetMarkLooks(): void {
  colours = null;
  looks = null;
}
