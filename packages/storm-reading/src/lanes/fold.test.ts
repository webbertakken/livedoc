// docs/specs/021-event-storming/lane-plans.md "The fold".
import { describe, expect, it } from 'vitest';
import { isLanePlan } from '@livedoc/document';
import { board, laneText, note } from '../testing';
import { checkLanePlan } from './check';
import { FOLD_BY, FOLD_REASON, foldLanes, foldPlan, sayNoFold } from './fold';
import { kitchen } from './kitchen.fixture';

const lanesOf = (result: ReturnType<typeof foldLanes>) =>
  'lanes' in result ? result.lanes.map((lane) => [lane.name, ...lane.notes]) : result.none;
const planOf = (result: ReturnType<typeof foldLanes>) => ('lanes' in result ? result.lanes : []);

describe('the fold', () => {
  it('has nothing to fold on a board that fits already', () => {
    expect(lanesOf(foldLanes(kitchen(), 4))).toBe('fits');
    expect(lanesOf(foldLanes(kitchen(), 9))).toBe('fits');
  });

  it('merges the two neighbouring lanes whose notes overlap least along the timeline', () => {
    // The policy stands between the columns, so its lane overlaps the events' lane least.
    expect(lanesOf(foldLanes(kitchen(), 3))).toEqual([
      ['Lane 1', 'cook', 'waiter'],
      ['Lane 2', 'take-order', 'plate-dish'],
      ['Lane 3', 'order-taken', 'fire-ticket', 'dish-plated'],
    ]);
  });

  it('goes on until the lanes asked for are left, and the plan passes the check', () => {
    const tab = kitchen();
    const result = foldLanes(tab, 2);
    expect(lanesOf(result)).toHaveLength(2);
    expect('lanes' in result && checkLanePlan(tab, result).ok).toBe(true);
  });

  it('keeps the name of the lane that held more notes, the upper lane’s when they held as many', () => {
    const tab = board(
      ...kitchen().elements,
      laneText('n1', 0, -16, 'People'),
      laneText('n3', 2, -16, 'Done'),
      laneText('n4', 3, -16, 'Rules'),
    );
    expect(planOf(foldLanes(tab, 3)).map((lane) => lane.name)).toEqual([
      'People',
      'Lane 2',
      'Done',
    ]);
    const even = board(
      { id: 'a', kind: 'domain-event', col: 0, lane: 0 },
      { id: 'b', kind: 'domain-event', col: 3, lane: 1 },
      { id: 'c', kind: 'domain-event', col: 6, lane: 2 },
      laneText('n1', 0, -16, 'Upper'),
      laneText('n2', 1, -16, 'Lower'),
    );
    expect(lanesOf(foldLanes(even, 2))).toEqual([
      ['Upper', 'a', 'b'],
      ['Lane 3', 'c'],
    ]);
    const lowerHeldMore = board(
      ...even.elements,
      { id: 'b2', kind: 'domain-event', col: 4, lane: 1 },
      { id: 'c2', kind: 'domain-event', col: 3, lane: 2 },
    );
    expect(lanesOf(foldLanes(lowerHeldMore, 2))).toEqual([
      ['Lower', 'a', 'b', 'b2'],
      ['Lane 3', 'c2', 'c'],
    ]);
  });

  it('folds only the notes a plan holds', () => {
    const locked = note({
      id: 'locked',
      kind: 'hotspot',
      col: 9,
      lane: 8,
      extra: { locked: true },
    });
    const result = foldLanes(board(...kitchen().elements, locked), 3);
    expect(planOf(result).flatMap((lane) => lane.notes)).not.toContain('locked');
    expect(planOf(result)).toHaveLength(3);
  });

  it('never folds to fewer than two lanes or more than twelve', () => {
    expect(lanesOf(foldLanes(kitchen(), 1))).toHaveLength(2);
    expect(lanesOf(foldLanes(kitchen(), 40))).toBe('fits');
  });

  it('says so when no fold keeps what the board says', () => {
    // Two commands one above the other, each beside its own event: on one lane either would cause the other's.
    const tab = board(
      { id: 'pay', kind: 'command', col: 0, lane: 0 },
      { id: 'paid', kind: 'domain-event', col: 1, lane: 0 },
      { id: 'ship', kind: 'command', col: 0, lane: 1 },
      { id: 'shipped', kind: 'domain-event', col: 1, lane: 1 },
      { id: 'pack', kind: 'command', col: 0, lane: 2 },
      { id: 'packed', kind: 'domain-event', col: 1, lane: 2 },
    );
    expect(lanesOf(foldLanes(tab, 2))).toBe('no_arrangement');
  });
});

describe('the fold as a plan', () => {
  it('is a lane plan by LiveDoc, boxed round the notes it holds, that says why', () => {
    const tab = kitchen();
    const folded = foldPlan(tab, 3, { id: 'plan', reason: FOLD_REASON });
    expect('plan' in folded && folded.plan).toMatchObject({
      id: 'plan',
      type: 'shape',
      esLanePlan: { by: FOLD_BY, reason: FOLD_REASON },
    });
    expect('plan' in folded && isLanePlan(folded.plan)).toBe(true);
    expect('plan' in folded && folded.plan.esLanePlan.lanes).toEqual(planOf(foldLanes(tab, 3)));
    expect('plan' in folded && checkLanePlan(tab, folded.plan.esLanePlan).ok).toBe(true);
  });

  it('is none where the fold is none, and says which', () => {
    expect(foldPlan(kitchen(), 4, { id: 'plan', reason: FOLD_REASON })).toEqual({ none: 'fits' });
  });

  it('says what the board says when there is nothing to fold, in the lanes asked for', () => {
    expect(sayNoFold('fits', 4)).toBe('The board already fits 4 lanes.');
    expect(sayNoFold('no_arrangement', 2)).toBe(
      'No arrangement in 2 lanes keeps what the board says. Try more lanes.',
    );
  });
});
