import { describe, expect, it } from 'vitest';
import { readBoard } from './reading';
import { board, note, STEP } from './testing';
import { STORM_SCHEMA } from './types';

describe('readBoard: what is read', () => {
  it('reads workshop notes with their words, lane and ref, and nothing else', () => {
    const tab = board(
      { id: 'e1', kind: 'domain-event', col: 0, words: '  Order   Placed ' },
      {
        id: 'plain',
        type: 'sticky',
        x: 0,
        y: 600,
        width: 200,
        height: 200,
        label: 'just a sticky',
      } as never,
      { id: 'box', type: 'shape', shape: 'square', x: 0, y: 0, width: 10, height: 10 } as never,
      { id: 'arrow', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } } as never,
      note({
        id: 's1',
        kind: 'command',
        col: -1,
        extra: { esSuggestion: { anchorId: 'e1', side: 'before' } },
      }),
    );
    const reading = readBoard(tab, { documentId: 'doc-1' });
    expect(reading.schema).toBe(STORM_SCHEMA);
    expect(reading.board).toEqual({ tabId: 'tab-1', name: 'Board', documentId: 'doc-1' });
    expect(reading.notes).toEqual([
      {
        id: 'e1',
        ref: expect.any(String),
        kind: 'domain-event',
        words: 'Order Placed',
        lane: 0,
        order: 0,
      },
    ]);
  });

  it('reads an empty board as empty', () => {
    const reading = readBoard(board());
    expect(reading).toMatchObject({ notes: [], timeline: [], chains: [], loose: [], gaps: [] });
    expect(reading.board).toEqual({ tabId: 'tab-1', name: 'Board' });
  });

  it('gives a note off its lane the lane it is nearest', () => {
    const off = note({ id: 'e1', kind: 'domain-event', col: 0, lane: 1 });
    const reading = readBoard(board({ ...off, y: (off as { y: number }).y + 90 } as never));
    expect(reading.notes[0]!.lane).toBe(1);
  });
});

describe('readBoard: relations in one row', () => {
  // Actor on the command, read model before it; command -> aggregate -> event -> policy -> command -> event.
  const row = board(
    { id: 'rm', kind: 'read-model', col: 0, words: 'Menu' },
    { id: 'c1', kind: 'command', col: 1, words: 'Place Order' },
    {
      id: 'a1',
      kind: 'actor',
      col: 1.3,
      words: 'Customer',
      extra: { y: 40 },
    },
    { id: 'agg', kind: 'aggregate', col: 2, words: 'Order' },
    { id: 'e1', kind: 'domain-event', col: 3.5, words: 'Order Placed' },
    {
      id: 'p1',
      kind: 'policy',
      col: 4.5,
      words: 'Whenever an order is placed, notify the kitchen',
    },
    { id: 'c2', kind: 'command', col: 6, words: 'Notify Kitchen' },
    { id: 'e2', kind: 'domain-event', col: 7, words: 'Kitchen Notified' },
  );
  const reading = readBoard(row);

  it('relates each kind to its partner', () => {
    expect(reading.relations).toEqual({
      causes: { c1: 'e1', c2: 'e2' },
      triggers: { p1: 'e1' },
      issues: { p1: 'c2', a1: 'c1' },
      informs: { rm: 'c1' },
      decides: { agg: 'e1' },
      flags: {},
    });
  });

  it('builds the timeline, the chain and the reading order', () => {
    expect(reading.timeline).toEqual([
      {
        event: 'e1',
        commands: [{ command: 'c1', actors: ['a1'], readModels: ['rm'], policy: null }],
        deciders: ['agg'],
        policies: [{ policy: 'p1', issues: 'c2' }],
        hotspots: [],
      },
      {
        event: 'e2',
        commands: [{ command: 'c2', actors: [], readModels: [], policy: 'p1' }],
        deciders: [],
        policies: [],
        hotspots: [],
      },
    ]);
    expect(reading.chains).toEqual([{ from: 'e1', policy: 'p1', command: 'c2', to: 'e2' }]);
    expect(reading.loose).toEqual([]);
    expect(reading.notes.map((n) => n.id)).toEqual([
      'rm',
      'a1',
      'c1',
      'agg',
      'e1',
      'p1',
      'c2',
      'e2',
    ]);
  });

  it('finds no flow gaps in a complete story', () => {
    expect(reading.gaps.filter((g) => g.level === 'flow')).toEqual([]);
  });
});

describe('readBoard: relations with a lane per kind', () => {
  // As the MCP storm graph lays a board out: one column per event, a lane per kind.
  const lanes = board(
    { id: 'a1', kind: 'actor', col: 0, lane: 0 },
    { id: 'c1', kind: 'command', col: 0, lane: 1 },
    { id: 'e1', kind: 'domain-event', col: 0, lane: 2 },
    { id: 'p1', kind: 'policy', col: 0, lane: 3 },
    { id: 'c2', kind: 'command', col: 1.5, lane: 1 },
    { id: 'e2', kind: 'domain-event', col: 1.5, lane: 2 },
  );
  const reading = readBoard(lanes);

  it('relates notes in the same column', () => {
    expect(reading.relations.causes).toEqual({ c1: 'e1', c2: 'e2' });
    expect(reading.relations.triggers).toEqual({ p1: 'e1' });
    expect(reading.relations.issues).toEqual({ p1: 'c2', a1: 'c1' });
  });
});

describe('readBoard: nearest, reach and ties', () => {
  it('prefers a partner on its own lane to one diagonally as far', () => {
    const reading = readBoard(
      board(
        { id: 'c', kind: 'command', col: 0, lane: 1 },
        { id: 'up', kind: 'domain-event', col: 0, lane: 0 },
        note({ id: 'same', kind: 'domain-event', col: 0, lane: 1, extra: { x: 240 } }),
      ),
    );
    // Both are 240 away; the one on the command's own lane wins the tie.
    expect(reading.relations.causes.c).toBe('same');
  });

  it('gives a tie to the lane above, then to document order', () => {
    const above = readBoard(
      board(
        { id: 'c', kind: 'command', col: 0, lane: 1 },
        { id: 'below', kind: 'domain-event', col: 0, lane: 2 },
        { id: 'above', kind: 'domain-event', col: 0, lane: 0 },
      ),
    );
    expect(above.relations.causes.c).toBe('above');
    const first = readBoard(
      board(
        { id: 'c', kind: 'command', col: 0, lane: 0 },
        { id: 'one', kind: 'domain-event', col: 1, lane: 0 },
        { id: 'two', kind: 'domain-event', col: 1, lane: 0 },
      ),
    );
    expect(first.relations.causes.c).toBe('one');
  });

  it('relates nothing beyond the reach, which makes the note loose', () => {
    const reading = readBoard(
      board(
        { id: 'c', kind: 'command', col: 0, lane: 0 },
        { id: 'e', kind: 'domain-event', col: 1, lane: 3 },
      ),
    );
    expect(reading.relations.causes).toEqual({});
    expect(reading.loose).toEqual(['c']);
  });

  it('never relates a command to an event behind it', () => {
    const reading = readBoard(
      board({ id: 'e', kind: 'domain-event', col: 0 }, { id: 'c', kind: 'command', col: 1 }),
    );
    expect(reading.relations.causes).toEqual({});
  });

  it('never lets a policy issue the command that caused its own trigger', () => {
    const reading = readBoard(
      board(
        { id: 'c1', kind: 'command', col: 0, lane: 1 },
        { id: 'e1', kind: 'domain-event', col: 0, lane: 2 },
        { id: 'p', kind: 'policy', col: 0, lane: 3 },
      ),
    );
    expect(reading.relations.triggers.p).toBe('e1');
    expect(reading.relations.issues.p).toBeUndefined();
  });

  it('lets a policy no event triggers still issue a command', () => {
    const reading = readBoard(
      board({ id: 'p', kind: 'policy', col: 0 }, { id: 'c', kind: 'command', col: 1.5 }),
    );
    expect(reading.relations.issues.p).toBe('c');
  });

  it('takes the command an actor overlaps most, the first when two overlap alike', () => {
    const reading = readBoard(
      board(
        { id: 'c1', kind: 'command', col: 0 },
        { id: 'c2', kind: 'command', col: 1 },
        { id: 'e', kind: 'domain-event', col: 3 },
        note({ id: 'a', kind: 'actor', col: 0, extra: { x: 200 - 30 } }),
      ),
    );
    // The actor laps c1 by 46px and c2 by 94px.
    expect(reading.relations.issues.a).toBe('c2');
    const even = readBoard(
      board(
        { id: 'c1', kind: 'command', col: 0 },
        { id: 'c2', kind: 'command', col: 1 },
        note({ id: 'a', kind: 'actor', col: 0, extra: { x: 200 + 8 - 70 } }),
      ),
    );
    expect(even.relations.issues.a).toBe('c1');
  });

  it('flags the note a hotspot overlaps most, else the nearest note', () => {
    const reading = readBoard(
      board(
        { id: 'e', kind: 'domain-event', col: 0 },
        { id: 'h-on', kind: 'hotspot', col: 0.2 },
        { id: 'h-near', kind: 'hotspot', col: 0, lane: 1 },
        { id: 'h-far', kind: 'hotspot', col: 0, lane: 5 },
      ),
    );
    expect(reading.relations.flags).toEqual({ 'h-on': 'e', 'h-near': 'e' });
    expect(reading.timeline[0]!.hotspots).toEqual(['h-near', 'h-on']);
    expect(reading.loose).toEqual(['h-far']);
  });
});

describe('readBoard: the timeline', () => {
  it('orders events by moment, then lane from the top', () => {
    const reading = readBoard(
      board(
        { id: 'late', kind: 'domain-event', col: 2 },
        { id: 'low', kind: 'domain-event', col: 0, lane: 1 },
        { id: 'top', kind: 'domain-event', col: 0, lane: 0 },
      ),
    );
    expect(reading.timeline.map((m) => m.event)).toEqual(['top', 'low', 'late']);
  });

  it('reaches a command a policy issues even when no event follows it', () => {
    const reading = readBoard(
      board(
        { id: 'e', kind: 'domain-event', col: 0 },
        { id: 'p', kind: 'policy', col: 1 },
        { id: 'c', kind: 'command', col: 2.5 },
        { id: 'a', kind: 'actor', col: 2.5, lane: 1 },
      ),
    );
    expect(reading.chains).toEqual([{ from: 'e', policy: 'p', command: 'c', to: null }]);
    expect(reading.loose).toEqual([]);
    expect(reading.notes.map((n) => n.id)).toEqual(['e', 'p', 'c', 'a']);
  });

  it('lists loose notes after the timeline, in time order', () => {
    const reading = readBoard(
      board(
        { id: 'rm', kind: 'read-model', col: 5 },
        { id: 'p', kind: 'policy', col: 3 },
        { id: 'e', kind: 'domain-event', col: 4, lane: 4 },
      ),
    );
    expect(reading.loose).toEqual(['p', 'rm']);
    expect(reading.notes.map((n) => n.order)).toEqual([0, 1, 2]);
    expect(STEP).toBe(216);
  });
});
