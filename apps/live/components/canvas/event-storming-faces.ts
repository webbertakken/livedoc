import { familyFace, useKindFamilyNeeded } from '@/lib/element-kinds/react';

// The Event Storming family's faces (docs/specs/016-platform/web-performance.md "An element kind's code loads with
// the board that holds it"): suggestions, the board's review and asks, drawn only on an Event Storming board and only
// once the family is in. The board's first paint waits for the family, so they draw in its first frame; a tab turned
// into an Event Storming board later asks for the family and they draw when it lands.

export const SuggestionLayer = familyFace('event-storming', 'SuggestionLayer');
export const BoardOffers = familyFace('event-storming', 'BoardOffers');
export const ReviewButton = familyFace('event-storming', 'ReviewButton');
export const ReviewCorner = familyFace('event-storming', 'ReviewCorner');
export const ReviewRings = familyFace('event-storming', 'ReviewRings');
export const ReviewHost = familyFace('event-storming', 'ReviewHost');
export const AskHost = familyFace('event-storming', 'AskHost');

/** Whether an Event Storming board's own faces can draw: on such a board, once the family is in (asked for if not). */
export function useEventStormingFaces(esBoard: boolean): boolean {
  return useKindFamilyNeeded(esBoard ? 'event-storming' : null) && esBoard;
}
