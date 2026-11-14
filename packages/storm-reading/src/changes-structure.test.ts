// docs/specs/021-event-storming/domain-export.md "Iterative, never from scratch": the About, pivotal marks and
// hotspot answers in CHANGES.md.
import { describe, expect, it } from 'vitest';
import { parsePreviousReading } from './bundle';
import { diffReadings, formatChanges, hasChanges } from './changes';
import { readBoard } from './reading';
import { board } from './testing';

type Extra = Record<string, unknown>;
const notes = (extra: { e1?: Extra; e2?: Extra; h1?: Extra; h2?: Extra } = {}) =>
  board(
    { id: 'e1', kind: 'domain-event', col: 0, words: 'Order Placed', extra: extra.e1 },
    { id: 'e2', kind: 'domain-event', col: 1, words: 'Order Paid', extra: extra.e2 },
    { id: 'h1', kind: 'hotspot', col: 0, lane: 1, words: 'Who pays?', extra: extra.h1 },
    { id: 'h2', kind: 'hotspot', col: 1, lane: 1, words: 'Tips?', extra: extra.h2 },
  );

describe('diffReadings: the room’s own knowledge', () => {
  const before = readBoard({
    ...notes({ e1: { esPivotal: true }, h2: { esAnswer: 'Never.' } }),
    esAbout: 'A bakery.',
  });
  const after = readBoard({
    ...notes({ e2: { esPivotal: true }, h1: { esAnswer: 'The guest.' } }),
    esAbout: 'A bakery with a café.',
  });
  const changes = diffReadings(before, after);

  it('notices the About changed', () => {
    expect(changes.about).toEqual([{ was: 'A bakery.', now: 'A bakery with a café.' }]);
    expect(diffReadings(after, after).about).toEqual([]);
  });

  it('notices events marked and unmarked pivotal', () => {
    expect(changes.pivotalMarked).toEqual(['e2']);
    expect(changes.pivotalUnmarked).toEqual(['e1']);
  });

  it('notices hotspots answered, answered differently and reopened', () => {
    expect(changes.answered).toEqual([{ hotspot: 'h1', answer: 'The guest.' }]);
    expect(changes.reopened).toEqual(['h2']);
    const again = readBoard(notes({ h1: { esAnswer: 'The host.' } }));
    expect(diffReadings(after, again).answered).toEqual([{ hotspot: 'h1', answer: 'The host.' }]);
  });

  it('does not report a hotspot that left the board as reopened', () => {
    const gone = readBoard(board({ id: 'e1', kind: 'domain-event', col: 0 }));
    expect(diffReadings(before, gone).reopened).toEqual([]);
  });

  it('prints them in CHANGES.md', () => {
    const text = formatChanges(changes, before, after);
    expect(text).toContain('## About\n\n- The About changed: read it again in storm.md');
    expect(text).toContain('## Marked pivotal\n\n- domain-event e2 "Order Paid"');
    expect(text).toContain('## No longer pivotal\n\n- domain-event e1 "Order Placed"');
    expect(text).toContain('## Answered\n\n- hotspot h1 "Who pays?": The guest.');
    expect(text).toContain('## Reopened\n\n- hotspot h2 "Tips?"');
    expect(hasChanges(changes)).toBe(true);
  });
});

describe('parsePreviousReading', () => {
  it('reads a reading made before the structure as having none', () => {
    const current = readBoard(notes({ e1: { esPivotal: true } }));
    const {
      lanes: _l,
      pivotal: _p,
      phases: _ph,
      decisions: _d,
      contextMap: _m,
      ...older
    } = current;
    const parsed = parsePreviousReading(JSON.stringify(older))!;
    expect(parsed).toMatchObject({
      lanes: [],
      pivotal: [],
      phases: [],
      decisions: [],
      contextMap: [],
    });
    expect(diffReadings(parsed, current).pivotalMarked).toEqual(['e1']);
  });
});
