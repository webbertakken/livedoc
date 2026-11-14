import { describe, expect, it } from 'vitest';
import { isLanePlan, type StickyElement } from '@livedoc/document';
import { arrangeOffer, arrangeRefusal, lanePlanOffer, lanePlanRow } from './board-offer';
import { note } from './change-board.fixture';
import { kitchenNotes, kitchenTab, plannedKitchen } from './lane-board.fixture';

// docs/specs/021-event-storming/lane-plans.md "How a person sees and decides" and
// docs/specs/021-event-storming/arrange.md "How a person arranges": the board as it would stand, never written.

const at = (elements: readonly { id: string }[], id: string) => {
  const el = elements.find((e) => e.id === id) as StickyElement;
  return [el.x, el.y];
};

describe('a lane plan offered', () => {
  it('draws the board as applying would leave it: notes on their lanes, the names written, the plan gone', () => {
    const tab = plannedKitchen();
    const offer = lanePlanOffer(tab, 'plan')!;
    expect(offer).toMatchObject({ what: 'lane-plan', lanes: 2, gained: 0 });
    expect(offer.elements.some(isLanePlan)).toBe(false);
    expect(
      offer.elements.filter((el) => el.type === 'text').map((el) => [el.id, el.label]),
    ).toEqual([
      ['offered-lane-name-1', 'Orders'],
      ['offered-lane-name-2', 'Kitchen'],
    ]);
    // The commands' lane is the first of two now.
    expect(at(offer.elements, 'take-order')[1]).toBe(at(tab.elements, 'cook')[1]);
    // The board is untouched.
    expect(at(tab.elements, 'take-order')).toEqual(at(kitchenNotes(), 'take-order'));
  });

  it('brings the whole board as it would be into view, lane names included', () => {
    const offer = lanePlanOffer(plannedKitchen(), 'plan')!;
    const names = offer.elements.filter((el) => el.type === 'text');
    expect(offer.bounds.x).toBe(Math.min(...names.map((n) => n.x)));
    const right = Math.max(
      ...offer.elements.filter((el) => el.type === 'sticky').map((n) => n.x + n.width),
    );
    expect(offer.bounds.x + offer.bounds.width).toBe(right);
  });

  it('offers nothing for another plan, no plan, or a plan the board outgrew', () => {
    expect(lanePlanOffer(plannedKitchen(), 'other')).toBeNull();
    expect(lanePlanOffer(kitchenTab(), 'plan')).toBeNull();
    const late = plannedKitchen();
    late.elements.push(note('late', 'Why?', 5, 'hotspot', 0));
    expect(lanePlanOffer(late, 'plan')).toBeNull();
  });
});

describe("the plan's row", () => {
  it('says how many lanes and notes, and where the board would stand', () => {
    const tab = plannedKitchen({ reason: 'Two parts', by: 'Claude' });
    const row = lanePlanRow(tab)!;
    expect(row).toMatchObject({ type: 'lane-plan', lanes: 2, notes: 7, stale: false });
    expect(row.plan.id).toBe('plan');
    expect(row.bounds).toEqual(lanePlanOffer(tab, 'plan')!.bounds);
  });

  it('is stale when the board changed since, and points at the notes as they stand', () => {
    const late = plannedKitchen();
    late.elements.push(note('late', 'Why?', 5, 'hotspot', 0));
    const row = lanePlanRow(late)!;
    expect(row.stale).toBe(true);
    expect(row.bounds.x).toBe(0);
    expect(row.bounds.width).toBeGreaterThan(0);
  });

  it('is none on a board without a plan', () => {
    expect(lanePlanRow(kitchenTab())).toBeNull();
  });
});

describe('arranging offered', () => {
  // The waiter's column stands a column further than it needs to.
  const loose = () =>
    kitchenTab(kitchenNotes().map((el) => (el.id === 'dish-plated' ? { ...el, x: 2000 } : el)));

  it('draws the board arranged along the timeline, every note on its lane', () => {
    const tab = loose();
    const offer = arrangeOffer(tab)!;
    expect(offer.what).toBe('arrange');
    expect(at(offer.elements, 'dish-plated')[0]).toBeLessThan(2000);
    expect(at(offer.elements, 'dish-plated')[1]).toBe(at(tab.elements, 'dish-plated')[1]);
    expect(offer.bounds.width).toBeLessThan(2200);
  });

  it('offers nothing where the board would not be arranged, and says why', () => {
    expect(arrangeOffer(kitchenTab([note('cook', 'Cook', 0, 'actor', 0)]))).toBeNull();
    expect(arrangeRefusal(kitchenTab([note('cook', 'Cook', 0, 'actor', 0)]))).toEqual({
      why: 'no_events',
    });
    const arranged = kitchenTab(arrangeOffer(loose())!.elements);
    expect(arrangeRefusal(arranged)).toEqual({ why: 'already' });
    expect(arrangeRefusal(loose())).toBeNull();
  });
});
