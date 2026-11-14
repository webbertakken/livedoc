// docs/specs/021-event-storming/lane-plans.md "What must stay true" and "How a person sees and decides" (Apply).
import { isLanePlan, newLanePlanElement, type EsLanePlan } from '@livedoc/document';
import { describe, expect, it } from 'vitest';
import { board, laneText, note } from '../testing';
import { applyLanePlan, checkLanePlan, landLanePlan } from './check';
import { at, kitchen, outOfReach, twoLanes } from './kitchen.fixture';

const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

describe('checking a lane plan', () => {
  it('passes a plan that keeps what the board says, with the board as it would stand', () => {
    const verdict = checkLanePlan(kitchen(), { lanes: twoLanes });
    expect(verdict).toMatchObject({ ok: true, top: 0, gained: 0 });
    expect(verdict.ok && at(verdict, 'take-order')).toEqual([156, 0]);
  });

  it('counts the loose notes that find a partner', () => {
    // An actor four lanes from its command is loose; a lane under it, it issues the command.
    const tab = board(
      { id: 'pay', kind: 'command', col: 1, lane: 0 },
      { id: 'paid', kind: 'domain-event', col: 2, lane: 0 },
      { id: 'buyer', kind: 'actor', col: 0, lane: 4 },
    );
    const verdict = checkLanePlan(tab, {
      lanes: [
        { name: 'Flow', notes: ['pay', 'paid'] },
        { name: 'People', notes: ['buyer'] },
      ],
    });
    expect(verdict).toMatchObject({ ok: true, gained: 1 });
  });

  it('refuses a plan that changes what the board says, naming what changes', () => {
    const verdict = checkLanePlan(kitchen(), { lanes: outOfReach });
    expect(verdict).toMatchObject({ ok: false, why: 'reading_changes' });
    expect(
      verdict.ok === false && verdict.why === 'reading_changes' && verdict.changes,
    ).toContainEqual({
      relation: 'causes',
      from: 'take-order',
      was: 'order-taken',
      now: null,
    });
  });

  it('refuses a plan whose notes would land on one that stays', () => {
    const locked = note({
      id: 'locked',
      kind: 'hotspot',
      col: 2,
      lane: 0,
      extra: { locked: true },
    });
    const verdict = checkLanePlan(board(...kitchen().elements, locked), { lanes: twoLanes });
    expect(verdict).toEqual({ ok: false, why: 'blocked', blocked: ['locked'] });
  });

  it('calls a plan stale when a note it holds has gone', () => {
    const tab = board(...kitchen().elements.filter((el) => el.id !== 'waiter'));
    expect(checkLanePlan(tab, { lanes: twoLanes })).toEqual({
      ok: false,
      why: 'stale',
      stale: 'gone',
    });
  });

  it('calls a plan stale when a note it does not hold has arrived', () => {
    const tab = board(...kitchen().elements, { id: 'late', kind: 'hotspot', col: 5, lane: 0 });
    expect(checkLanePlan(tab, { lanes: twoLanes })).toEqual({
      ok: false,
      why: 'stale',
      stale: 'arrived',
    });
  });
});

describe('applying a lane plan', () => {
  const plan: EsLanePlan = { lanes: twoLanes, reason: 'Two parts of the business', by: 'Claude' };
  const withPlan = () => {
    const tab = kitchen();
    const held = tab.elements.filter((el) => el.type === 'sticky');
    const element = newLanePlanElement({ id: 'plan', plan, notes: held });
    return board(...tab.elements, laneText('n-people', 0, -16, 'People'), element);
  };

  it('moves the notes, writes the lane names and removes the plan', () => {
    const next = applyLanePlan(withPlan(), plan, ids())!;
    expect(at({ elements: next }, 'order-taken')).toEqual([372, 0]);
    expect(next.some(isLanePlan)).toBe(false);
    expect(next.filter((el) => el.type === 'text').map((el) => el.label)).toEqual([
      'Orders',
      'Kitchen',
    ]);
  });

  it('lands a verdict as applying does, for a preview that checks once', () => {
    const tab = withPlan();
    const verdict = checkLanePlan(tab, plan);
    if (!verdict.ok) throw new Error('the plan passes');
    expect(landLanePlan(tab, plan, verdict, ids())).toEqual(applyLanePlan(tab, plan, ids()));
  });

  it('applies nothing when the plan no longer passes', () => {
    const tab = board(...withPlan().elements, { id: 'late', kind: 'hotspot', col: 5, lane: 0 });
    expect(applyLanePlan(tab, plan, ids())).toBeNull();
  });
});
