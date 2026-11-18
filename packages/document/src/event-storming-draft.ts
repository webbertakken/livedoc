// A photo import's draft notes (docs/specs/021-event-storming/event-storming.md Phase 8): base, since every commit and
// the editor's chrome ask whether a draft is open; reading a photo into one is the Event Storming family's
// (event-storming-photo.ts).
import type { Element, StickyElement } from './index';

// The draft (docs/specs/021-event-storming/event-storming.md Phase 8)
// ---------------------------------------------------------------------
//
// An import lands ON the board rather than in a dialog: the new notes appear at
// their final positions carrying `esDraft`, and the author reviews them by
// typing into them, dragging them and deleting them — the machinery they
// already know, rather than a second copy of it inside an overlay. These three
// functions are the whole lifecycle.

export function draftNotesOf(elements: Element[]): StickyElement[] {
  return elements.filter((el): el is StickyElement => el.type === 'sticky' && el.esDraft === true);
}

export function hasDraftNotes(elements: Element[]): boolean {
  return elements.some((el) => el.type === 'sticky' && el.esDraft === true);
}

// Accept: the notes stay exactly where the author left them and simply stop
// being a draft. Returns the SAME array when there is no draft, so an ordinary
// commit never churns the memoised views.
export function acceptDraft(elements: Element[]): Element[] {
  if (!hasDraftNotes(elements)) return elements;
  return elements.map((el) => {
    if (el.type !== 'sticky' || el.esDraft !== true) return el;
    const { esDraft: _gone, ...rest } = el;
    void _gone;
    return rest;
  });
}

// Discard: the draft never happened.
export function discardDraft(elements: Element[]): Element[] {
  if (!hasDraftNotes(elements)) return elements;
  return elements.filter((el) => !(el.type === 'sticky' && el.esDraft === true));
}

// Does this change touch ONLY the notes a photo draft brought in?
//
// While a draft is open it owns the history: the landing, and every correction
// the author makes to a draft note, are one gesture that ends at Add or
// Discard. So an edit confined to draft notes is written without a history
// step of its own — and an edit to anything ELSE is not, because the author's
// unrelated work must survive a Discard.
export function onlyDraftNotesChanged(before: Element[], after: Element[]): boolean {
  const isDraft = (el: Element) => el.type === 'sticky' && el.esDraft === true;
  const beforeById = new Map(before.map((el) => [el.id, el] as const));
  const afterById = new Map(after.map((el) => [el.id, el] as const));
  let changed = false;
  for (const el of before) {
    const next = afterById.get(el.id);
    if (next === el) continue;
    // Removed, or edited: either way it has to be a draft note.
    if (!isDraft(el)) return false;
    changed = true;
  }
  for (const el of after) {
    if (beforeById.has(el.id)) continue;
    // Newly arrived: a draft note joining the batch is still the gesture.
    if (!isDraft(el)) return false;
    changed = true;
  }
  return changed;
}
