// The engine's invariants (docs/specs/024-agents/edit-operations.md,
// I1 to I7), held by one changeset per operation of the vocabulary on the checkout flow.

import { describe, expect, it } from 'vitest';
import {
  applyElementOps,
  deriveContainers,
  isContainer,
  type Element,
  type Tab,
} from '@livedoc/document';
import { checkoutFlow } from './fixtures/checkout-flow';
import { applied } from './fixtures/outcomes';
import { run } from './fixtures/run';
import { EDIT_OPERATION_NAMES } from './vocabulary';

const SAMPLES: Readonly<Record<Name, string>> = {
  add: 'add sticky label="Fraud check" right-of:n5',
  set: 'set n3 label="Sign in" fill=green',
  rm: 'rm n7',
  move: 'move f2 by=300,0',
  connect: 'connect n2 -> n8 label=skip',
  rewire: 'rewire a6 to=n8',
  insert: 'insert square id=verify label="Verify email" between n3 n4',
  wrap: 'wrap n7 n8 in frame label=Payment',
  unwrap: 'unwrap f2',
  order: 'order f2 front',
  layout: 'layout n5 n6 n7 n8 direction=right',
  test: 'test n3 label=Login',
  suggest: 'suggest command "Place Order" before=placed reason="every event has a cause"',
  'suggest-context': 'suggest-context "Ordering" placed reason="one part of the business"',
  wall: JSON.stringify({
    op: 'wall',
    photos: [
      {
        width: 1000,
        height: 500,
        notes: [{ kind: 'command', words: 'Ship Order', x: 50, y: 50, w: 100, h: 100 }],
      },
    ],
  }),
};

type Name = (typeof EDIT_OPERATION_NAMES)[number];

// The checkout flow, or for `suggest` the same flow on an Event Storming board with one domain event to anchor on.
function tabFor(name: string): Tab {
  const flow = checkoutFlow();
  if (name !== 'suggest' && name !== 'suggest-context' && name !== 'wall') return flow;
  const placed: Element = {
    id: 'placed',
    type: 'sticky',
    x: 2000,
    y: 0,
    width: 200,
    height: 200,
    label: 'Order Placed',
    esKind: 'domain-event',
  };
  return { ...flow, kind: 'event-storming', elements: [...flow.elements, placed] };
}

const samples = Object.entries(SAMPLES);
const frozen = (tab: Tab) => JSON.parse(JSON.stringify(tab)) as Tab;

describe('invariants', () => {
  it('has a sample for every operation', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...EDIT_OPERATION_NAMES].sort());
  });

  it.each(samples)(
    '%s: a rejected changeset carries no tab and the input is untouched (I1)',
    (name, text) => {
      const tab = tabFor(name);
      const outcome = run(`${text}\ntest n1 label=Nope`, tab);
      expect(outcome).not.toHaveProperty('tab');
      expect(tab).toEqual(frozen(tabFor(name)));
    },
  );

  it.each(samples)(
    '%s: the input tab is never mutated, and what stayed is the same object (I1, I2)',
    (name, text) => {
      const tab = tabFor(name);
      const { tab: next } = applied(run(text, tab));
      expect(tab).toEqual(frozen(tabFor(name)));
      const before = new Map(tab.elements.map((el) => [el.id, el]));
      for (const el of next.elements) {
        const was = before.get(el.id);
        if (was && JSON.stringify(was) === JSON.stringify(el)) expect(el).toBe(was);
      }
    },
  );

  it.each(samples)('%s: element ops and their inverse round trip (I4)', (name, text) => {
    const tab = tabFor(name);
    const { tab: next, elementOps, inverse } = applied(run(text, tab));
    expect(applyElementOps(tab.elements, elementOps)).toEqual(next.elements);
    expect(applyElementOps(next.elements, inverse)).toEqual(tab.elements);
  });

  it.each(samples)('%s: the same input gives the same outcome (I5)', (name, text) => {
    expect(run(text, tabFor(name))).toEqual(run(text, tabFor(name)));
  });

  it.each(samples)('%s: lanes first, and every container behind its members (I6)', (name, text) => {
    const lane: Element = {
      id: 'lane',
      type: 'shape',
      shape: 'lane',
      x: -400,
      y: -100,
      width: 2000,
      height: 1200,
    };
    const tab = { ...tabFor(name), elements: [...tabFor(name).elements, lane] };
    const { tab: next } = applied(run(text, tab));
    const order = next.elements.map((el) => el.id);
    const firstOther = next.elements.findIndex(
      (el) => !(el.type === 'shape' && el.shape === 'lane'),
    );
    expect(
      next.elements.slice(firstOther).some((el) => el.type === 'shape' && el.shape === 'lane'),
    ).toBe(false);
    const byId = new Map(next.elements.map((el) => [el.id, el]));
    for (const [id, holder] of deriveContainers(next.elements)) {
      if (holder && isContainer(byId.get(holder)!))
        expect(order.indexOf(holder)).toBeLessThan(order.indexOf(id));
    }
  });

  it.each(samples)('%s: no locked element changes (I7)', (name, text) => {
    for (const id of tabFor(name).elements.map((el) => el.id)) {
      const base = tabFor(name);
      const tab = {
        ...base,
        elements: base.elements.map((el) => (el.id === id ? { ...el, locked: true } : el)),
      };
      const outcome = run(text, tab);
      if ('errors' in outcome) {
        expect(outcome.errors[0]!.code).toBe('element_locked');
        continue;
      }
      const lockedBefore = tab.elements.find((el) => el.id === id);
      expect(outcome.tab.elements.find((el) => el.id === id)).toEqual(lockedBefore);
    }
  });
});
