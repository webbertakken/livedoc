// docs/specs/021-event-storming/arrange.md "How the board arranges" and "What must stay true".
import { describe, expect, it } from 'vitest';
import { ARRANGE_COLUMN_GAP } from '../constants';
import { board, note } from '../testing';
import { arrangeBoard } from './arrange';
import { at, kitchen, xs } from './kitchen.fixture';

const arranged = (tab: Parameters<typeof arrangeBoard>[0]) => {
  const result = arrangeBoard(tab);
  if (!result.ok) throw new Error(`not arranged: ${result.why}`);
  return result;
};

describe('arranging a board along the timeline', () => {
  it('stands a column per event, in the timeline’s order, from where the wall starts', () => {
    const tab = board(
      { id: 'late', kind: 'domain-event', col: 9 },
      { id: 'early', kind: 'domain-event', col: 2 },
      { id: 'middle', kind: 'domain-event', col: 5.5 },
    );
    const result = arranged(tab);
    expect(xs(result.elements)).toEqual([2 * 216 + 2 * 248, 2 * 216, 2 * 216 + 248]);
    expect(result).toMatchObject({ gap: ARRANGE_COLUMN_GAP, gained: 0 });
  });

  it('stands a note in the column of the event it belongs to, one centre for the lanes of a column', () => {
    const result = arranged(kitchen());
    // The first column is as wide as its policy; every note of it shares the policy's centre.
    expect(at(result, 'fire-ticket')[0]).toBe(0);
    expect(at(result, 'order-taken')[0]).toBe(50);
    expect(at(result, 'take-order')[0]).toBe(50);
    expect(at(result, 'cook')[0]).toBe(80);
    // The next column stands a column gap on.
    expect(at(result, 'dish-plated')[0]).toBe(300 + ARRANGE_COLUMN_GAP);
    expect(at(result, 'waiter')[0]).toBe(300 + ARRANGE_COLUMN_GAP + 30);
  });

  it('keeps every note on its lane', () => {
    const tab = kitchen();
    const result = arranged(tab);
    expect(result.elements.map((el) => at(result, el.id)[1])).toEqual(
      tab.elements.map((el) => at(tab, el.id)[1]),
    );
  });

  it('stands the notes of one lane a gutter apart, in the reading’s order', () => {
    const tab = board(
      { id: 'placed', kind: 'domain-event', col: 3 },
      { id: 'rule', kind: 'policy', col: 4.2 },
      { id: 'place', kind: 'command', col: 1.5 },
      { id: 'buyer', kind: 'actor', col: 0 },
    );
    const result = arranged(tab);
    expect(['buyer', 'place', 'placed', 'rule'].map((id) => at(result, id)[0])).toEqual([
      0,
      140 + 16,
      140 + 16 + 200 + 16,
      140 + 16 + 200 + 16 + 200 + 16,
    ]);
  });

  it('gives a note the timeline does not reach a column of its own, where it stands among the events', () => {
    const tab = board(
      { id: 'first', kind: 'domain-event', col: 1 },
      { id: 'second', kind: 'domain-event', col: 6 },
      { id: 'stray', kind: 'read-model', col: 3, lane: 5 },
      { id: 'before', kind: 'actor', col: 0, lane: 5 },
    );
    const result = arranged(tab);
    expect(['before', 'first', 'stray', 'second'].map((id) => at(result, id)[0])).toEqual([
      0,
      140 + 48,
      140 + 48 + 248,
      140 + 48 + 2 * 248,
    ]);
  });

  it('arranges an arranged board to itself', () => {
    const once = arranged(kitchen());
    expect(arrangeBoard({ elements: once.elements })).toEqual({ ok: false, why: 'already' });
  });

  it('has nothing to follow on a board with no event', () => {
    const tab = board({ id: 'place', kind: 'command', col: 0 });
    expect(arrangeBoard(tab)).toEqual({ ok: false, why: 'no_events' });
  });

  it('widens the columns’ gap, step by step, until the board says the same', () => {
    // An aggregate two lanes above its event: the next column's event, on the aggregate's lane, must stay further.
    const tab = board(
      { id: 'stock', kind: 'aggregate', col: 0, lane: 0 },
      { id: 'reserved', kind: 'domain-event', col: 0.25, lane: 2 },
      { id: 'counted', kind: 'domain-event', col: 3.5, lane: 0 },
      { id: 'ledger', kind: 'aggregate', col: 3.25, lane: 2 },
    );
    const result = arranged(tab);
    expect(result.gap).toBe(192);
    expect(at(result, 'ledger')[0]).toBe(300 + 192);
    // Arranged so, it arranges to itself: the closer spacings still fail.
    expect(arrangeBoard({ elements: result.elements })).toEqual({ ok: false, why: 'already' });
  });

  it('keeps a loose note loose, in a column of its own', () => {
    const tab = board(
      { id: 'paid', kind: 'domain-event', col: 2, lane: 0 },
      { id: 'pay', kind: 'command', col: 4, lane: 0 },
      { id: 'shipped', kind: 'domain-event', col: 9, lane: 3 },
    );
    // The command stands after the event beside it and out of reach of the next: it causes none, before and after.
    const result = arranged(tab);
    expect(result.gained).toBe(0);
    expect(['paid', 'pay', 'shipped'].map((id) => at(result, id)[0])).toEqual([432, 680, 928]);
  });

  it('refuses when no spacing keeps what the board says, naming what would change', () => {
    // A hotspot two lanes above the event it flags; the next event, on the hotspot's lane, comes nearer at any gap.
    const tab = board(
      { id: 'why', kind: 'hotspot', col: 0, lane: 0 },
      { id: 'reserved', kind: 'domain-event', col: 0, lane: 2 },
      { id: 'counted', kind: 'domain-event', col: 5, lane: 0 },
    );
    expect(arrangeBoard(tab)).toEqual({
      ok: false,
      why: 'reading_changes',
      changes: [{ relation: 'flags', from: 'why', was: 'reserved', now: 'counted' }],
    });
  });

  it('moves no locked note and no note placed free of the lanes, and refuses to land on one', () => {
    const locked = note({
      id: 'locked',
      kind: 'hotspot',
      col: 4,
      lane: 2,
      extra: { locked: true },
    });
    const tab = board(...kitchen().elements, locked);
    const result = arranged(tab);
    expect(result.elements.at(-1)).toBe(locked);
    const inTheWay = note({
      id: 'way',
      kind: 'read-model',
      col: 1.5,
      lane: 2,
      extra: { locked: true },
    });
    expect(arrangeBoard(board(...kitchen().elements, inTheWay))).toEqual({
      ok: false,
      why: 'blocked',
      blocked: ['way'],
    });
  });

  it('gives a note whose event stays a column of its own', () => {
    const tab = board(
      { id: 'kept', kind: 'domain-event', col: 3, extra: { locked: true } },
      { id: 'ask', kind: 'command', col: 2 },
      { id: 'done', kind: 'domain-event', col: 6, lane: 1 },
      { id: 'who', kind: 'actor', col: 1.25 },
    );
    const result = arranged(tab);
    // The actor issues the command, which heads their column; the locked event stays where it is.
    expect(['who', 'ask', 'kept', 'done'].map((id) => at(result, id)[0])).toEqual([
      270,
      270 + 156,
      648,
      270 + 356 + 48,
    ]);
  });
});
