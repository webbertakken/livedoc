import type { Element, ElementId } from '@livedoc/document';
import { READING_CHANGES_SHOWN, sayReadingChange } from '@livedoc/storm-reading';
import type { ArrangeRefusal, BoardOffer } from './board-offer';

// What the bar says of a whole board rearranged (docs/specs/021-event-storming/lane-plans.md "How a person sees and
// decides", docs/specs/021-event-storming/arrange.md "How a person arranges" and "What must stay true"): the offer in
// one line, and a refusal with the notes that are a way in to fix the board by hand. Pure.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const gains = (gained: number): string[] =>
  gained > 0 ? [plural(gained, 'loose note finds a partner', 'loose notes find a partner')] : [];

/** The offer in one line: what it is, that the board reads the same, and what it gains. */
export function boardOfferLine(offer: BoardOffer): string {
  const said =
    offer.what === 'lane-plan'
      ? [plural(offer.lanes, 'lane', 'lanes'), 'Reads the same']
      : ['Arranged and reordered along the timeline'];
  return [...said, ...gains(offer.gained)].join(' · ');
}

/** A note to go to: what to say of it, and which it is. */
export type WayIn = { id: ElementId; words: string };

export type ArrangeRefusalWords = {
  message: string;
  // The first few notes the refusal is about; `more` counts the rest.
  ways: WayIn[];
  more: number;
};

const MESSAGES: Record<ArrangeRefusal['why'], string> = {
  no_events: 'No events yet. Arrange and Reorder follows the timeline.',
  already: 'Already arranged.',
  reading_changes: 'Arranging would change what the board says.',
  blocked: 'A note that stays where it is stands in the way.',
};

/** Why the board was not arranged, in a person's words. */
export function arrangeRefusalWords(
  refusal: ArrangeRefusal,
  elements: readonly Element[],
): ArrangeRefusalWords {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const name = (id: ElementId) => {
    const words = byId.get(id)?.label?.trim();
    return words ? `“${words}”` : 'A blank note';
  };
  const all: WayIn[] =
    refusal.why === 'reading_changes'
      ? refusal.changes.map((change) => ({
          id: change.from,
          words: sayReadingChange(change, name, name),
        }))
      : refusal.why === 'blocked'
        ? refusal.blocked.map((id) => ({ id, words: name(id) }))
        : [];
  return {
    message: MESSAGES[refusal.why],
    ways: all.slice(0, READING_CHANGES_SHOWN),
    more: Math.max(0, all.length - READING_CHANGES_SHOWN),
  };
}
