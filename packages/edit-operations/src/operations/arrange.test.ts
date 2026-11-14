import { describe, expect, it } from 'vitest';
import { formatOperation } from '../format-operation';
import { parseEditOperations } from '../parse';
import { checkoutFlow } from '../fixtures/checkout-flow';
import { kitchenBoard, laneNote } from '../fixtures/kitchen-board';
import { applied, lines, refused } from '../fixtures/outcomes';
import { boxIn, run } from '../fixtures/run';

// docs/specs/021-event-storming/arrange.md "How an agent arranges".

describe('arrange: parsing', () => {
  it('takes no arguments, in either form', () => {
    expect(parseEditOperations('arrange')).toEqual({ operations: [{ op: 'arrange' }] });
    expect(parseEditOperations('{"op":"arrange"}')).toEqual({ operations: [{ op: 'arrange' }] });
    expect(formatOperation({ op: 'arrange' })).toBe('arrange');
    const extra = parseEditOperations('arrange cook');
    expect('errors' in extra && extra.errors[0]!.details.join(' ')).toContain(
      'nothing after arrange',
    );
    const member = parseEditOperations('{"op":"arrange","target":"cook"}');
    expect('errors' in member && member.errors[0]!.details[0]).toContain('unknown member "target"');
  });
});

describe('arrange: applying', () => {
  it('lays the board out along the timeline, every note on its lane, as one changeset', () => {
    const tab = kitchenBoard();
    const outcome = applied(run('arrange', tab));
    expect(boxIn(outcome.tab, 'fire-ticket')[0]).toBe(0);
    expect(boxIn(outcome.tab, 'dish-plated')[0]).toBe(348);
    expect(boxIn(outcome.tab, 'cook')[1]).toBe(boxIn(tab, 'cook')[1]);
    expect(lines(outcome)).toEqual([
      '» cook waiter take-order plate-dish order-taken dish-plated fire-ticket  arranged',
    ]);
    expect(outcome.createdIds).toEqual([]);
  });

  it('answers the board it arranged to: arranging again has nothing to do', () => {
    const once = applied(run('arrange', kitchenBoard()));
    const again = refused(run('arrange', once.tab));
    expect(again).toMatchObject({
      code: 'nothing_to_arrange',
      details: ['the board is arranged already'],
    });
  });

  it.each([
    ['arrange', checkoutFlow(), 'not_event_storming'],
    [
      'arrange',
      { ...kitchenBoard(), elements: [laneNote('ask', 'command', 0, 0)] },
      'nothing_to_arrange',
    ],
    [
      'arrange',
      kitchenBoard([laneNote('way', 'read-model', 1.5, 2, { locked: true })]),
      'lane_blocked',
    ],
    [
      'arrange',
      {
        ...kitchenBoard(),
        elements: [
          laneNote('why', 'hotspot', 0, 0),
          laneNote('reserved', 'domain-event', 0, 2),
          laneNote('counted', 'domain-event', 5, 0),
        ],
      },
      'reading_changes',
    ],
  ])('refuses %s on a board it cannot arrange (%#)', (text, tab, code) => {
    expect(refused(run(text, tab)).code).toBe(code);
  });

  it('says what stands in the way and what would change', () => {
    const noEvent = refused(
      run('arrange', { ...kitchenBoard(), elements: [laneNote('ask', 'command', 0, 0)] }),
    );
    expect(noEvent.details[0]).toContain('no events yet');
    const blocked = refused(
      run('arrange', kitchenBoard([laneNote('way', 'read-model', 1.5, 2, { locked: true })])),
    );
    expect(blocked.details[0]).toContain('a note would land on way');
    const changes = refused(
      run('arrange', {
        ...kitchenBoard(),
        elements: [
          laneNote('why', 'hotspot', 0, 0),
          laneNote('reserved', 'domain-event', 0, 2),
          laneNote('counted', 'domain-event', 5, 0),
        ],
      }),
    );
    expect(changes.details).toEqual(['why (hotspot) would no longer flag reserved (now counted)']);
  });
});
