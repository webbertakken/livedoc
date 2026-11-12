import {
  isBoxed,
  isSuggestion,
  landArrivals,
  suggestionBounds,
  withDependents,
  type Element,
  type ElementId,
  type Rect,
  type StickyElement,
} from '@livedoc/document';
import { applyInsertionShift } from './insert-between';
import { planNextNote } from './next-note-add';
import { suggestionSpots, suggestionsInTimeline, type SuggestionElement } from './suggestion-hints';

// Applying and dismissing suggestions (docs/specs/021-event-storming/suggestions.md "Applying and dismissing").
// Pure: each answers the board after the act, so the act is one commit through the ordinary choke point and one
// Undo puts the board back. A suggestion lands exactly where the next-note buttons land a note: `before` and
// `after` through `planNextNote` (one gutter beside, the insertion ripple when the spot is taken), `above` and
// `below` on the neighbouring lane with the left edges lined up, at the nearest free slot when that is taken.

type InertIds = ReadonlySet<ElementId>;

const NONE: InertIds = new Set();

function openSuggestion(elements: readonly Element[], id: ElementId): SuggestionElement | null {
  const el = elements.find((e) => e.id === id);
  return el && isSuggestion(el) ? (el as SuggestionElement) : null;
}

// The board without its orphans: suggestions whose chain ends nowhere (docs/specs/021-event-storming/suggestions.md
// "It goes with its anchor"). Every apply and dismiss sweeps them.
function withoutOrphans(elements: Element[]): Element[] {
  const spots = suggestionSpots(elements);
  const out = elements.filter((el) => !isSuggestion(el) || spots.has(el.id));
  return out.length === elements.length ? elements : out;
}

function asNote(s: SuggestionElement): StickyElement {
  const { esSuggestion: _dropped, ...note } = s;
  return note;
}

// Land one suggestion on a board already swept of orphans, its chain's earlier links first.
function land(elements: Element[], id: ElementId, inertIds: InertIds): Element[] {
  const s = openSuggestion(elements, id);
  if (!s) return elements;
  const anchor = elements.find((el) => el.id === s.esSuggestion.anchorId)!;
  if (isSuggestion(anchor)) return land(land(elements, anchor.id, inertIds), id, inertIds);
  const { side } = s.esSuggestion;

  if (side === 'before' || side === 'after') {
    // Open suggestions are invisible: never what the board opens around, though they travel with it.
    const inert = new Set(inertIds);
    for (const el of elements) if (isSuggestion(el)) inert.add(el.id);
    const plan = planNextNote(elements, anchor.id, side, s.esKind, inert)!;
    const opened = plan.ripple ? applyInsertionShift(elements, plan.ripple) : elements;
    return opened.map((el) => (el.id === id ? { ...asNote(s), ...plan.bounds } : el));
  }

  // Above or below: the lanes' own landing, over the board as it is seen (no other open suggestion in it).
  const placed: StickyElement = {
    ...asNote(s),
    ...suggestionBounds(anchor as StickyElement, side, s.esKind),
  };
  const seen = elements
    .filter((el) => el.id === id || !isSuggestion(el))
    .map((el) => (el.id === id ? placed : el));
  const landed = landArrivals(seen, new Set([id]), { x: 'free-slot' }).find((el) => el.id === id)!;
  return elements.map((el) => (el.id === id ? landed : el));
}

export function applySuggestion(
  elements: Element[],
  id: ElementId,
  inertIds: InertIds = NONE,
): Element[] {
  if (!openSuggestion(elements, id)) return elements;
  return land(withoutOrphans(elements), id, inertIds);
}

// Every open suggestion, in timeline order, each landed on the board the one before it left.
export function applyAllSuggestions(elements: Element[], inertIds: InertIds = NONE): Element[] {
  let board = withoutOrphans(elements);
  const order = suggestionsInTimeline(board);
  if (order.length === 0) return board;
  for (const { suggestion } of order) board = land(board, suggestion.id, inertIds);
  return board;
}

// Dismiss suggestions with the ones chained on them, and sweep the orphans. A note is never removed here.
export function dismissSuggestions(elements: Element[], ids: readonly ElementId[]): Element[] {
  const asked = new Set(ids.filter((id) => openSuggestion(elements, id)));
  const gone = withDependents(elements, asked);
  const kept = gone.size === 0 ? elements : elements.filter((el) => !gone.has(el.id));
  return withoutOrphans(kept);
}

// The Show All preview: the board as Apply All would leave it, as offsets on the elements that stand aside and the
// box each suggestion lands in. The document is never touched; the canvas draws this as a transform.
export function suggestionPreview(
  elements: Element[],
  inertIds: InertIds = NONE,
): { shiftX: Map<ElementId, number>; spots: Map<ElementId, Rect> } {
  const shiftX = new Map<ElementId, number>();
  const spots = new Map<ElementId, Rect>();
  const applied = applyAllSuggestions(elements, inertIds);
  if (applied === elements) return { shiftX, spots };
  const after = new Map(applied.map((el) => [el.id, el]));
  for (const el of elements) {
    const next = after.get(el.id);
    // An orphan is swept by the apply, and an arrow (never on its own here) has no box to shift.
    if (!next || !isBoxed(el) || !isBoxed(next)) continue;
    if (isSuggestion(el))
      spots.set(el.id, { x: next.x, y: next.y, width: next.width, height: next.height });
    else if (next.x !== el.x) shiftX.set(el.id, next.x - el.x);
  }
  return { shiftX, spots };
}
