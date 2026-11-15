// docs/specs/021-event-storming/board-reading.md "Structure"; docs/specs/021-event-storming/board-structure.md.
import { describe, expect, it } from 'vitest';
import { LANE_NAME_MAX } from '@livedoc/document';
import { readBoard } from './reading';
import { laneNameSpot } from './structure';
import { STEP, board, laneText } from './testing';

describe('readBoard: the About', () => {
  it('carries the board’s About, trimmed', () => {
    const tab = { ...board({ id: 'e1', kind: 'domain-event', col: 0 }), esAbout: ' A bakery. ' };
    expect(readBoard(tab).about).toBe('A bakery.');
  });

  it('carries none for a board without one', () => {
    expect(readBoard(board())).not.toHaveProperty('about');
    expect(readBoard({ ...board(), esAbout: '  ' })).not.toHaveProperty('about');
  });
});

describe('readBoard: lanes', () => {
  it('numbers the lanes that hold notes from the top, each with its notes left to right', () => {
    const reading = readBoard(
      board(
        { id: 'e2', kind: 'domain-event', col: 2, lane: 3 },
        { id: 'c1', kind: 'command', col: 0, lane: -1 },
        { id: 'e1', kind: 'domain-event', col: 0, lane: 3 },
      ),
    );
    expect(reading.lanes).toEqual([
      { number: 1, lane: -1, name: null, notes: ['c1'] },
      { number: 2, lane: 3, name: null, notes: ['e1', 'e2'] },
    ]);
  });

  it('names a lane by the text standing left of the wall on it', () => {
    const reading = readBoard(
      board(
        { id: 'c1', kind: 'command', col: 0, lane: 0 },
        { id: 'e1', kind: 'domain-event', col: 1, lane: 1 },
        laneText('t0', 0, -16, '  Commands '),
        laneText('t1', 1, -16, 'Domain events'),
      ),
    );
    expect(reading.lanes.map((l) => l.name)).toEqual(['Commands', 'Domain events']);
  });

  it('takes the text nearest the wall when a lane has several', () => {
    const reading = readBoard(
      board(
        { id: 'e1', kind: 'domain-event', col: 0 },
        laneText('far', 0, -400, 'Far'),
        laneText('near', 0, -16, 'Near'),
      ),
    );
    expect(reading.lanes[0]!.name).toBe('Near');
    const reversed = readBoard(
      board(
        { id: 'e1', kind: 'domain-event', col: 0 },
        laneText('near', 0, -16, 'Near'),
        laneText('far', 0, -400, 'Far'),
      ),
    );
    expect(reversed.lanes[0]!.name).toBe('Near');
  });

  it('reads no name from a text that is not left of the wall, off the lane, blank or on an empty lane', () => {
    const offLane = laneText('off', 0, -16, 'Off');
    const reading = readBoard(
      board(
        { id: 'e1', kind: 'domain-event', col: 0 },
        { id: 'e2', kind: 'domain-event', col: 1, lane: 1 },
        laneText('inside', 0, 120, 'Inside'),
        { ...offLane, y: (offLane as { y: number }).y + 110 } as never,
        laneText('blank', 1, -16, '   '),
        laneText('empty', 5, -16, 'Nobody home'),
      ),
    );
    expect(reading.lanes).toEqual([
      { number: 1, lane: 0, name: null, notes: ['e1'] },
      { number: 2, lane: 1, name: null, notes: ['e2'] },
    ]);
  });

  it('cuts a long name', () => {
    const reading = readBoard(
      board({ id: 'e1', kind: 'domain-event', col: 0 }, laneText('t', 0, -16, 'n'.repeat(90))),
    );
    expect(reading.lanes[0]!.name).toHaveLength(LANE_NAME_MAX);
  });

  it('reads an empty board as having none', () => {
    expect(readBoard(board())).toMatchObject({
      lanes: [],
      pivotal: [],
      phases: [],
      decisions: [],
      contextMap: [],
    });
  });
});

describe('readBoard: pivotal events and phases', () => {
  const pivotal = { esPivotal: true };

  it('lists the events marked pivotal in timeline order and the phases they close', () => {
    const reading = readBoard(
      board(
        { id: 'e1', kind: 'domain-event', col: 0 },
        { id: 'e2', kind: 'domain-event', col: 1, extra: pivotal },
        { id: 'e3', kind: 'domain-event', col: 2 },
        { id: 'e4', kind: 'domain-event', col: 3, extra: pivotal },
        { id: 'e5', kind: 'domain-event', col: 4 },
      ),
    );
    expect(reading.pivotal).toEqual(['e2', 'e4']);
    expect(reading.phases).toEqual([
      { closes: 'e2', events: ['e1', 'e2'] },
      { closes: 'e4', events: ['e3', 'e4'] },
      { closes: null, events: ['e5'] },
    ]);
  });

  it('has no trailing phase when the last event is pivotal', () => {
    const reading = readBoard(
      board(
        { id: 'e1', kind: 'domain-event', col: 0 },
        { id: 'e2', kind: 'domain-event', col: 1, extra: pivotal },
      ),
    );
    expect(reading.phases).toEqual([{ closes: 'e2', events: ['e1', 'e2'] }]);
  });

  it('has no phases without a pivotal event, and ignores a mark on another kind', () => {
    const reading = readBoard(
      board(
        { id: 'c1', kind: 'command', col: 0, extra: pivotal },
        { id: 'e1', kind: 'domain-event', col: 1 },
      ),
    );
    expect(reading.pivotal).toEqual([]);
    expect(reading.phases).toEqual([]);
  });
});

describe('readBoard: decisions', () => {
  it('reads an answered hotspot as a decision and no longer as an open one', () => {
    const reading = readBoard(
      board(
        { id: 'e1', kind: 'domain-event', col: 0, words: 'Order Placed' },
        {
          id: 'h1',
          kind: 'hotspot',
          col: 0,
          lane: 1,
          words: 'Who pays?',
          extra: { esAnswer: ' The guest,  up front. ' },
        },
        { id: 'h2', kind: 'hotspot', col: 1, lane: 1, words: 'Refunds?' },
      ),
    );
    expect(reading.decisions).toEqual([
      { hotspot: 'h1', question: 'Who pays?', answer: 'The guest, up front.', flags: 'e1' },
    ]);
    expect(reading.gaps.filter((g) => g.code === 'open_hotspot').map((g) => g.ids)).toEqual([
      ['h2'],
    ]);
  });

  it('reads a hotspot that flags nothing with no flagged note', () => {
    const reading = readBoard(
      board({ id: 'h1', kind: 'hotspot', col: 0, extra: { esAnswer: 'Yes.' } }),
    );
    expect(reading.decisions).toEqual([
      { hotspot: 'h1', question: 'h1', answer: 'Yes.', flags: null },
    ]);
  });
});

describe('readBoard: an event outside every context', () => {
  const context = (id: string, notes: string[]) =>
    ({
      id,
      type: 'shape',
      shape: 'square',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      label: id,
      esContext: { notes },
    }) as never;

  it('is a question when the board keeps a context', () => {
    const reading = readBoard(
      board(
        { id: 'e1', kind: 'domain-event', col: 0, words: 'Order Placed' },
        { id: 'e2', kind: 'domain-event', col: 1, words: 'Meal Prepared' },
        { id: 'c2', kind: 'command', col: 1, lane: 1 },
        context('k1', ['e1']),
      ),
    );
    const gaps = reading.gaps.filter((g) => g.code === 'event_without_context');
    expect(gaps).toEqual([
      {
        code: 'event_without_context',
        level: 'question',
        ids: ['e2'],
        message: '"Meal Prepared": in no candidate context',
        remedy: null,
      },
    ]);
  });

  it('is nothing on a board that keeps no context', () => {
    const reading = readBoard(board({ id: 'e1', kind: 'domain-event', col: 0 }));
    expect(reading.gaps.some((g) => g.code === 'event_without_context')).toBe(false);
  });
});

describe('laneNameSpot', () => {
  const kitchen = board(
    { id: 'c1', kind: 'command', col: 1, lane: 0 },
    { id: 'e1', kind: 'domain-event', col: 2, lane: 1 },
    laneText('t1', 1, STEP - 16, 'Kitchen'),
    laneText('blank', 0, STEP - 16, '   '),
  );

  it('says the lane a note stands on, the wall it stands behind, and the text naming the lane', () => {
    expect(laneNameSpot(kitchen, 'e1')).toEqual({
      lane: 1,
      wallLeft: STEP,
      text: kitchen.elements[2],
    });
  });

  it('holds no text for a lane nothing names: a text with no words names nothing', () => {
    expect(laneNameSpot(kitchen, 'c1')).toEqual({ lane: 0, wallLeft: STEP, text: null });
  });

  it('is null for anything that is not a workshop note of the board', () => {
    expect(laneNameSpot(kitchen, 't1')).toBeNull();
    expect(laneNameSpot(kitchen, 'nowhere')).toBeNull();
  });
});
