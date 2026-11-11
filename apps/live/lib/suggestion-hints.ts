import {
  eventStormingKindOf,
  isSuggestion,
  suggestionBounds,
  suggestionKindOf,
  type Element,
  type ElementId,
  type EsSuggestion,
  type EsSuggestionSide,
  type EventStormingNoteKind,
  type Rect,
  type StickyElement,
} from '@livedoc/document';

// Where an event-storming board's suggestions show (docs/specs/021-event-storming/suggestions.md "How a person sees
// them"). A suggestion's place is derived from its anchor as the board stands, never read from its stored x and y,
// so a hint follows its note when the note moves. Pure: the canvas only draws what this answers.

export type SuggestionElement = StickyElement & {
  esSuggestion: EsSuggestion;
  esKind: EventStormingNoteKind;
};

// One hint: an anchor's side and every suggestion that grows from it there, chains included, in order.
export type SuggestionHint = {
  key: string;
  anchorId: ElementId;
  anchor: StickyElement;
  side: EsSuggestionSide;
  // The first suggestion's kind: the colour the hint wears.
  kind: EventStormingNoteKind;
  suggestions: SuggestionElement[];
};

const asSuggestion = (el: Element): SuggestionElement | null =>
  isSuggestion(el) && suggestionKindOf(el) ? (el as SuggestionElement) : null;

const isWorkshopNote = (el: Element | undefined): el is StickyElement =>
  el !== undefined && el.type === 'sticky' && eventStormingKindOf(el) !== null;

// Every suggestion whose anchor chain ends on a workshop note, with the spot it would land on. An orphan, a cycle
// and a suggestion anchored on anything but a note have no spot, so nothing shows them.
export function suggestionSpots(elements: readonly Element[]): Map<ElementId, Rect> {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const spots = new Map<ElementId, Rect>();
  const visiting = new Set<ElementId>();

  const spotOf = (s: SuggestionElement): Rect | null => {
    const known = spots.get(s.id);
    if (known) return known;
    if (visiting.has(s.id)) return null;
    visiting.add(s.id);
    const anchor = byId.get(s.esSuggestion.anchorId);
    const anchorSuggestion = anchor ? asSuggestion(anchor) : null;
    const anchorRect = anchorSuggestion
      ? spotOf(anchorSuggestion)
      : isWorkshopNote(anchor)
        ? anchor
        : null;
    visiting.delete(s.id);
    if (!anchorRect) return null;
    const spot = suggestionBounds(anchorRect, s.esSuggestion.side, s.esKind);
    spots.set(s.id, spot);
    return spot;
  };

  for (const el of elements) {
    const s = asSuggestion(el);
    if (s) spotOf(s);
  }
  return spots;
}

// The suggestions with a spot, each with the workshop note its chain grows from and the side of the chain's first
// link, in chain order (a suggestion before the ones anchored on it), then document order.
function rooted(elements: readonly Element[]) {
  const spots = suggestionSpots(elements);
  const byId = new Map(elements.map((el) => [el.id, el]));
  const out: {
    suggestion: SuggestionElement;
    spot: Rect;
    root: StickyElement;
    side: EsSuggestionSide;
    depth: number;
  }[] = [];
  elements.forEach((el) => {
    const s = asSuggestion(el);
    const spot = s ? spots.get(s.id) : undefined;
    if (!s || !spot) return;
    let link = s;
    let depth = 0;
    for (;;) {
      const up = asSuggestion(byId.get(link.esSuggestion.anchorId)!);
      if (!up) break;
      link = up;
      depth += 1;
    }
    const root = byId.get(link.esSuggestion.anchorId) as StickyElement;
    out.push({ suggestion: s, spot, root, side: link.esSuggestion.side, depth });
  });
  return out.sort((a, b) => a.depth - b.depth);
}

export function suggestionHints(elements: readonly Element[]): SuggestionHint[] {
  const hints = new Map<string, SuggestionHint>();
  for (const { suggestion, root, side } of rooted(elements)) {
    const key = `${root.id}:${side}`;
    const hint = hints.get(key);
    if (hint) hint.suggestions.push(suggestion);
    else
      hints.set(key, {
        key,
        anchorId: root.id,
        anchor: root,
        side,
        kind: suggestion.esKind,
        suggestions: [suggestion],
      });
  }
  return [...hints.values()];
}

// The open suggestions in timeline order: where they would land, left to right, then top to bottom.
export function suggestionsInTimeline(
  elements: readonly Element[],
): { suggestion: SuggestionElement; spot: Rect; anchor: StickyElement }[] {
  return rooted(elements)
    .sort((a, b) => a.spot.x - b.spot.x || a.spot.y - b.spot.y)
    .map(({ suggestion, spot, root }) => ({ suggestion, spot, anchor: root }));
}
