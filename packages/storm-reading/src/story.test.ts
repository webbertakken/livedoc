// docs/specs/021-event-storming/board-review.md "Story".
import { describe, expect, it } from 'vitest';
import { readBoard } from './reading';
import { storySteps } from './story';
import { board } from './testing';

describe('storySteps', () => {
  const reading = readBoard(
    board(
      { id: 'rm', kind: 'read-model', col: 0, words: 'Menu' },
      { id: 'c1', kind: 'command', col: 1, words: 'Place Order' },
      { id: 'a1', kind: 'actor', col: 1, lane: -1, words: 'Guest' },
      { id: 'agg', kind: 'aggregate', col: 2, words: 'Order' },
      {
        id: 'e1',
        kind: 'domain-event',
        col: 3.5,
        words: 'Order Placed',
        extra: { esPivotal: true },
      },
      { id: 'h1', kind: 'hotspot', col: 3.5, lane: 1, words: 'Who pays?' },
      { id: 'p1', kind: 'policy', col: 4.5, words: 'Notify kitchen' },
      { id: 'c2', kind: 'command', col: 6, words: 'Prepare Meal' },
      { id: 'e2', kind: 'domain-event', col: 7, words: 'Meal Prepared' },
      {
        id: 'h2',
        kind: 'hotspot',
        col: 7,
        lane: 1,
        words: 'Cold food?',
        extra: { esAnswer: 'Remake it.' },
      },
    ),
  );
  const steps = storySteps(reading);

  it('tells one step per event, in timeline order', () => {
    expect(steps.map((s) => s.event)).toEqual(['e1', 'e2']);
    expect(steps.map((s) => s.happens)).toEqual(['Order Placed', 'Meal Prepared']);
  });

  it('says who issues which command, with what, and what decides the event', () => {
    expect(steps[0]!.leads).toEqual(['Guest: Place Order (with Menu)']);
    expect(steps[0]!.deciders).toEqual(['Order']);
    expect(steps[1]!.leads).toEqual(['Prepare Meal']);
  });

  it('says what each policy does next', () => {
    expect(steps[0]!.follows).toEqual(['Whenever Order Placed: Notify kitchen, then Prepare Meal']);
    expect(steps[1]!.follows).toEqual([]);
  });

  it('carries the questions, an answered one with its answer', () => {
    expect(steps[0]!.questions).toEqual(['Who pays?']);
    expect(steps[1]!.questions).toEqual(['Cold food? Remake it.']);
  });

  it('names every note of the step, and whether its event closes a phase', () => {
    expect([...steps[0]!.notes].sort()).toEqual(['a1', 'agg', 'c1', 'e1', 'h1', 'p1', 'rm']);
    expect(steps.map((s) => s.closesPhase)).toEqual([true, false]);
  });

  it('tells a policy that issues nothing, and a blank note, plainly', () => {
    const lone = storySteps(
      readBoard(
        board(
          { id: 'e1', kind: 'domain-event', col: 0, words: '' },
          { id: 'p1', kind: 'policy', col: 1, words: 'Archive it' },
        ),
      ),
    );
    expect(lone[0]!.happens).toBe('(blank)');
    expect(lone[0]!.follows).toEqual(['Whenever (blank): Archive it']);
  });

  it('has no steps on a board without events', () => {
    expect(storySteps(readBoard(board({ id: 'c1', kind: 'command', col: 0 })))).toEqual([]);
  });
});
