// docs/specs/021-event-storming/lane-plans.md "Share roles" (an agent reads the open plan in the storm view).
import { newLanePlanElement } from '@livedoc/document';
import { describe, expect, it } from 'vitest';
import { board } from '../testing';
import { kitchen, twoLanes } from './kitchen.fixture';
import { readLanePlan } from './view';

const withPlan = (extra: { reason?: string; by?: string } = {}) => {
  const tab = kitchen();
  const plan = newLanePlanElement({ id: 'plan', plan: { lanes: twoLanes, ...extra }, notes: [] });
  return board(...tab.elements, plan);
};

describe('the open lane plan in the storm view', () => {
  it('is none on a board without one', () => {
    expect(readLanePlan(kitchen())).toBeNull();
  });

  it('says its ref, its lanes and how many notes each holds, why and who', () => {
    expect(readLanePlan(withPlan({ reason: 'Two parts', by: 'Claude' }))).toEqual({
      id: 'plan',
      ref: 'plan',
      lanes: [
        { name: 'Orders', notes: 3 },
        { name: 'Kitchen', notes: 4 },
      ],
      reason: 'Two parts',
      by: 'Claude',
      stale: false,
    });
  });

  it('says when the board changed since it was made', () => {
    const tab = withPlan();
    const late = board(...tab.elements, { id: 'late', kind: 'hotspot', col: 5, lane: 0 });
    expect(readLanePlan(late)).toMatchObject({ stale: true });
    expect(readLanePlan(late)).not.toHaveProperty('reason');
  });
});
