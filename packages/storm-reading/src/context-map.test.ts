// docs/specs/021-event-storming/board-reading.md "The context map".
import { describe, expect, it } from 'vitest';
import { readBoard } from './reading';
import { board } from './testing';

const context = (id: string, notes: string[], suggested = false) =>
  ({
    id,
    type: 'shape',
    shape: 'square',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    label: id,
    esContext: { notes, ...(suggested ? { suggestion: {} } : {}) },
  }) as never;

// Place Order -> Order Placed -> (Notify kitchen) -> Prepare Meal -> Meal Prepared, in one row.
const flow = [
  { id: 'c1', kind: 'command', col: 0, words: 'Place Order' },
  { id: 'e1', kind: 'domain-event', col: 1, words: 'Order Placed' },
  { id: 'p1', kind: 'policy', col: 2, words: 'Notify kitchen' },
  { id: 'c2', kind: 'command', col: 3.5, words: 'Prepare Meal' },
  { id: 'e2', kind: 'domain-event', col: 4.5, words: 'Meal Prepared' },
] as const;

describe('readBoard: the context map', () => {
  it('lists what crosses from one kept context to another, in the direction the flow runs', () => {
    const reading = readBoard(
      board(...flow, context('ordering', ['c1', 'e1']), context('kitchen', ['p1', 'c2', 'e2'])),
    );
    expect(reading.contextMap).toEqual([
      {
        from: 'ordering',
        to: 'kitchen',
        crossings: [{ relation: 'triggers', from: 'e1', to: 'p1' }],
      },
    ]);
  });

  it('reads a policy that issues a command in another context, and a command whose event is', () => {
    const reading = readBoard(
      board(
        ...flow,
        context('ordering', ['c1', 'e1', 'p1']),
        context('kitchen', ['c2']),
        context('serving', ['e2']),
      ),
    );
    expect(reading.contextMap).toEqual([
      {
        from: 'ordering',
        to: 'kitchen',
        crossings: [{ relation: 'issues', from: 'p1', to: 'c2' }],
      },
      {
        from: 'kitchen',
        to: 'serving',
        crossings: [{ relation: 'causes', from: 'c2', to: 'e2' }],
      },
    ]);
  });

  it('groups the crossings of one pair of contexts', () => {
    const reading = readBoard(
      board(
        ...flow,
        { id: 'p2', kind: 'policy', col: 2, lane: 1, words: 'Print ticket' },
        context('ordering', ['c1', 'e1']),
        context('kitchen', ['p1', 'p2', 'c2', 'e2']),
      ),
    );
    expect(reading.contextMap).toHaveLength(1);
    expect(reading.contextMap[0]!.crossings.map((c) => c.to)).toEqual(['p1', 'p2']);
  });

  it('makes no crossing of a note in no context, of two notes in one, or of an actor', () => {
    const reading = readBoard(
      board(
        ...flow,
        { id: 'a1', kind: 'actor', col: 0, lane: -1, words: 'Guest' },
        context('ordering', ['c1', 'e1', 'p1']),
        context('people', ['a1']),
      ),
    );
    expect(reading.contextMap).toEqual([]);
  });

  it('has no map with fewer than two kept contexts, and reads no suggested one', () => {
    const reading = readBoard(
      board(...flow, context('ordering', ['c1', 'e1']), context('kitchen', ['p1'], true)),
    );
    expect(reading.contextMap).toEqual([]);
  });
});
