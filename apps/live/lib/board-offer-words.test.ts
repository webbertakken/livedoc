import { describe, expect, it } from 'vitest';
import { arrangeRefusalWords, boardOfferLine } from './board-offer-words';
import { note } from './change-board.fixture';

// docs/specs/021-event-storming/lane-plans.md "How a person sees and decides", arrange.md "What must stay true".

const offer = { elements: [], bounds: { x: 0, y: 0, width: 1, height: 1 } };

describe('what the bar says of an offer', () => {
  it('says a lane plan reads the same, and what it gains', () => {
    expect(boardOfferLine({ ...offer, what: 'lane-plan', lanes: 3, gained: 0 })).toBe(
      '3 lanes · Reads the same',
    );
    expect(boardOfferLine({ ...offer, what: 'lane-plan', lanes: 1, gained: 2 })).toBe(
      '1 lane · Reads the same · 2 loose notes find a partner',
    );
  });

  it('says a board was arranged along the timeline', () => {
    expect(boardOfferLine({ ...offer, what: 'arrange', gained: 0 })).toBe(
      'Arranged and reordered along the timeline',
    );
    expect(boardOfferLine({ ...offer, what: 'arrange', gained: 1 })).toBe(
      'Arranged and reordered along the timeline · 1 loose note finds a partner',
    );
  });
});

describe('why a board was not arranged', () => {
  const elements = [
    note('take', 'Take order', 0, 'command'),
    note('taken', 'Order taken', 1),
    note('blank', '  ', 2),
  ];

  it('says there is nothing to arrange', () => {
    expect(arrangeRefusalWords({ why: 'no_events' }, elements)).toEqual({
      message: 'No events yet. Arrange and Reorder follows the timeline.',
      ways: [],
      more: 0,
    });
    expect(arrangeRefusalWords({ why: 'already' }, elements).message).toBe('Already arranged.');
  });

  it('names the first relations that would change, by the notes’ words, each a way in', () => {
    const change = { relation: 'causes' as const, from: 'take', was: 'taken', now: null };
    const words = arrangeRefusalWords(
      {
        why: 'reading_changes',
        changes: [
          change,
          { relation: 'order', from: 'blank', was: 'taken', now: null },
          ...Array.from({ length: 5 }, () => change),
        ],
      },
      elements,
    );
    expect(words.message).toBe('Arranging would change what the board says.');
    expect(words.ways).toHaveLength(5);
    expect(words.ways[0]).toEqual({
      id: 'take',
      words: '“Take order” would no longer cause “Order taken”',
    });
    expect(words.ways[1]!.words).toBe(
      'A blank note would read before “Order taken”, which it follows',
    );
    expect(words.more).toBe(2);
  });

  it('names the note in the way, even one that has gone meanwhile', () => {
    expect(arrangeRefusalWords({ why: 'blocked', blocked: ['taken', 'gone'] }, elements)).toEqual({
      message: 'A note that stays where it is stands in the way.',
      ways: [
        { id: 'taken', words: '“Order taken”' },
        { id: 'gone', words: 'A blank note' },
      ],
      more: 0,
    });
  });
});
