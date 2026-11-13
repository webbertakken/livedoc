import { describe, expect, it } from 'vitest';
import { formatStormView } from './format';
import { readBoard } from './reading';
import { readSuggestions } from './suggestions';
import { board, note } from './testing';

const view = (...specs: Parameters<typeof board>) => {
  const tab = board(...specs);
  return formatStormView(readBoard(tab), readSuggestions(tab));
};

describe('formatStormView', () => {
  it('says an empty board has no notes', () => {
    expect(view()).toEqual([
      'board "Board" · 0 notes · 0 events · 0 chains · 0 gaps · 0 suggestions',
      'no notes',
    ]);
  });

  it('prints the timeline, chains, loose notes, gaps and suggestions', () => {
    const lines = view(
      { id: 'rm', kind: 'read-model', col: 0, words: 'Menu' },
      { id: 'c1', kind: 'command', col: 1, words: 'Place Order' },
      { id: 'a1', kind: 'actor', col: 1, lane: 1, words: 'Customer' },
      { id: 'agg', kind: 'aggregate', col: 2, words: 'Order' },
      { id: 'e1', kind: 'domain-event', col: 3.5, words: 'Order Placed' },
      { id: 'h1', kind: 'hotspot', col: 3.6, words: 'Refunds?' },
      { id: 'p1', kind: 'policy', col: 4.5, words: 'Notify kitchen' },
      { id: 'c2', kind: 'command', col: 6, words: 'Notify Kitchen' },
      { id: 'p2', kind: 'policy', col: 3.5, lane: 2, words: 'Loyalty' },
      { id: 'lost', kind: 'external-system', col: 20, lane: 6, words: 'Stripe' },
      note({
        id: 's1',
        kind: 'domain-event',
        col: 7,
        words: 'Kitchen Notified',
        extra: {
          esSuggestion: {
            anchorId: 'c2',
            side: 'after',
            reason: 'every command ends in an event',
            gap: 'command_without_event',
            by: 'Claude',
          },
        },
      }),
      note({
        id: 's2',
        kind: 'actor',
        col: 7,
        words: 'Chef',
        extra: { esSuggestion: { anchorId: 'gone', side: 'above' } },
      }),
      note({
        id: 's3',
        kind: 'actor',
        col: 7,
        words: 'Cook',
        extra: { esSuggestion: { anchorId: 'c1', side: 'above' } },
      }),
    );
    expect(lines).toEqual([
      'board "Board" · 10 notes · 1 event · 2 chains · 2 gaps · 2 suggestions',
      'timeline',
      '1 event e1 "Order Placed"',
      '  <- command c1 "Place Order" · actor a1 "Customer" · read-model rm "Menu"',
      '  @ aggregate agg "Order"',
      '  -> policy p2 "Loyalty" => command c2 "Notify Kitchen"',
      '  -> policy p1 "Notify kitchen" => command c2 "Notify Kitchen"',
      '  ! hotspot h1 "Refunds?"',
      'loose',
      '  external lost "Stripe"',
      'gaps',
      '  question open_hotspot h1: "Refunds?" is still open',
      '  flow command_without_event c2: "Notify Kitchen": no event follows from it (remedy: event after c2)',
      'suggestions',
      '  s1 event "Kitchen Notified" after c2 · gap command_without_event · by Claude: every command ends in an event',
      '  s3 actor "Cook" above c1',
      '  1 orphaned suggestion (anchor or notes gone; never shown)',
    ]);
  });

  it('prints a bare command and a policy that issues nothing', () => {
    const lines = view(
      { id: 'c', kind: 'command', col: 0, words: 'Pay' },
      { id: 'e', kind: 'domain-event', col: 1, words: 'Paid' },
      { id: 'p', kind: 'policy', col: 2, words: 'Thank' },
      note({
        id: 's',
        kind: 'actor',
        col: 0,
        words: 'Guest',
        extra: { esSuggestion: { anchorId: 'c', side: 'above' } },
      }),
    );
    expect(lines.slice(3, 5)).toEqual(['  <- command c "Pay"', '  -> policy p "Thank"']);
    expect(lines.at(-1)).toBe('  s actor "Guest" above c');
  });

  it('names the policy that issues a command', () => {
    const lines = view(
      { id: 'e1', kind: 'domain-event', col: 0, words: 'Paid' },
      { id: 'p', kind: 'policy', col: 1, words: 'Thank' },
      { id: 'c', kind: 'command', col: 2.5, words: 'Send Thanks' },
      { id: 'e2', kind: 'domain-event', col: 3.5, words: 'Thanks Sent' },
    );
    expect(lines).toContain('  <- command c "Send Thanks" · policy p "Thank"');
  });
});
