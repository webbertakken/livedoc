// Suggestions on an event-storming board (docs/specs/021-event-storming/suggestions.md): a note an agent proposes,
// carried as a sticky with `esSuggestion` so it travels like any element (changesets, the room, undo), yet is no
// board content: it has no notation kind, and the layer funnels drop it as they drop a hidden layer's elements.

import { eventStormingNoteSize, type EventStormingNoteKind } from './event-storming';
import { ES_LANES, laneCentre, laneIndexAt, nearestLaneTop } from './event-storming-lanes';
import { nextNoteBounds } from './event-storming-next';
import type { Rect } from './geometry-primitives';
import type { Element, ElementId } from './index';

// Where a suggestion goes against its anchor: along the anchor's lane, or on the lane above or below it.
export type EsSuggestionSide = 'before' | 'after' | 'above' | 'below';

export const ES_SUGGESTION_SIDES: readonly EsSuggestionSide[] = [
  'before',
  'after',
  'above',
  'below',
];

export type EsSuggestion = {
  anchorId: ElementId;
  side: EsSuggestionSide;
  // Why, in the agent's words.
  reason?: string;
  // The board-reading gap code it closes.
  gap?: string;
  // Who suggested it: the agent's name as its presence shows it.
  by?: string;
};

export const SUGGESTION_REASON_MAX = 200;
export const SUGGESTION_GAP_MAX = 40;
export const SUGGESTION_BY_MAX = 60;
// Open suggestions one board may hold.
export const SUGGESTIONS_MAX = 60;

const optionalText = (v: unknown, max: number) =>
  v === undefined || (typeof v === 'string' && v.length <= max);

export function isValidEsSuggestion(v: unknown): v is EsSuggestion {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.anchorId === 'string' &&
    s.anchorId.length > 0 &&
    ES_SUGGESTION_SIDES.includes(s.side as EsSuggestionSide) &&
    optionalText(s.reason, SUGGESTION_REASON_MAX) &&
    optionalText(s.gap, SUGGESTION_GAP_MAX) &&
    optionalText(s.by, SUGGESTION_BY_MAX)
  );
}

export function isSuggestion(el: { type: string; esSuggestion?: unknown }): boolean {
  return el.type === 'sticky' && el.esSuggestion !== undefined;
}

// The kind a suggestion proposes; null for anything that is not a suggestion.
export function suggestionKindOf(el: Element): EventStormingNoteKind | null {
  return el.type === 'sticky' && el.esSuggestion !== undefined ? (el.esKind ?? null) : null;
}

// Where a suggestion lands against its anchor, on a lane: `before` and `after` one gutter beside it, as a next
// note lands; `above` and `below` on the neighbouring lane with the left edges lined up.
export function suggestionBounds(
  anchor: Rect,
  side: EsSuggestionSide,
  kind: EventStormingNoteKind,
): Rect {
  if (side === 'before' || side === 'after') {
    const beside = nextNoteBounds(anchor, side, kind);
    return { ...beside, y: nearestLaneTop(beside) };
  }
  const size = eventStormingNoteSize(kind);
  const lane = laneIndexAt(anchor.y + anchor.height / 2, ES_LANES) + (side === 'above' ? -1 : 1);
  return { x: anchor.x, y: laneCentre(lane, ES_LANES) - size.height / 2, ...size };
}
