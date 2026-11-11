import { describe, expect, it } from 'vitest';
import { readBoard } from './reading';
import { board, type NoteSpec } from './testing';
import type { GapCode } from './types';

const gapsOf = (...specs: NoteSpec[]) => readBoard(board(...specs)).gaps;
const codes = (...specs: NoteSpec[]) => gapsOf(...specs).map((g) => [g.code, ...g.ids].join(' '));

describe('gaps: the flow', () => {
  it('asks what makes an event happen, with a command before it as the remedy', () => {
    expect(gapsOf({ id: 'e', kind: 'domain-event', col: 0, words: 'Order Placed' })).toEqual([
      {
        code: 'event_without_cause',
        level: 'flow',
        ids: ['e'],
        message: '"Order Placed": nothing on the board makes it happen',
        remedy: { kind: 'command', side: 'before', anchor: 'e' },
      },
    ]);
  });

  it('lets an external system cause an event', () => {
    expect(
      codes(
        { id: 'x', kind: 'external-system', col: 0, words: 'Stripe' },
        { id: 'e', kind: 'domain-event', col: 1.5, words: 'Payment Received' },
      ),
    ).toEqual([]);
  });

  it('still asks when only an aggregate decides the event', () => {
    expect(
      codes(
        { id: 'g', kind: 'aggregate', col: 0, words: 'Order' },
        { id: 'e', kind: 'domain-event', col: 1.5, words: 'Order Placed' },
      ),
    ).toEqual(['event_without_cause e']);
  });

  it('finds a command with no event and no one issuing it', () => {
    const gaps = gapsOf({ id: 'c', kind: 'command', col: 0, words: 'Place Order' });
    expect(gaps.map((g) => [g.code, g.remedy])).toEqual([
      ['command_without_event', { kind: 'domain-event', side: 'after', anchor: 'c' }],
      ['command_without_trigger', { kind: 'actor', side: 'above', anchor: 'c' }],
    ]);
  });

  it('finds a policy with no trigger and no command', () => {
    const gaps = gapsOf({ id: 'p', kind: 'policy', col: 0, words: 'Notify kitchen' });
    expect(gaps.map((g) => [g.code, g.remedy])).toEqual([
      ['policy_without_trigger', { kind: 'domain-event', side: 'before', anchor: 'p' }],
      ['policy_without_command', { kind: 'command', side: 'after', anchor: 'p' }],
    ]);
  });

  it('finds a read model no command is decided with', () => {
    expect(gapsOf({ id: 'r', kind: 'read-model', col: 0, words: 'Menu' })).toMatchObject([
      { code: 'read_model_unused', remedy: { kind: 'command', side: 'after', anchor: 'r' } },
    ]);
  });
});

describe('gaps: the notation', () => {
  it('finds a blank note, naming its kind', () => {
    expect(gapsOf({ id: 'g', kind: 'aggregate', col: 0, words: ' ' })).toMatchObject([
      {
        code: 'blank_note',
        level: 'notation',
        message: 'a blank aggregate has no words',
        remedy: null,
      },
    ]);
  });

  it('finds an event not in the past tense and a command in it', () => {
    expect(
      codes(
        { id: 'a', kind: 'actor', col: 0, lane: 1, words: 'Cook' },
        { id: 'c', kind: 'command', col: 0, words: 'Cooked Meal' },
        { id: 'e1', kind: 'domain-event', col: 1, words: 'Meal Cooked' },
        { id: 'c2', kind: 'command', col: 2, words: 'Serve' },
        { id: 'a2', kind: 'actor', col: 2, lane: 1, words: 'Waiter' },
        { id: 'e2', kind: 'domain-event', col: 3, words: 'Meal Served' },
        { id: 'c3', kind: 'command', col: 4, words: 'Pay' },
        { id: 'a3', kind: 'actor', col: 4, lane: 1, words: 'Guest' },
        { id: 'e3', kind: 'domain-event', col: 5, words: 'Bill Paid' },
        { id: 'c4', kind: 'command', col: 6, words: 'Leave' },
        { id: 'a4', kind: 'actor', col: 6, lane: 1, words: 'Guest' },
        { id: 'e4', kind: 'domain-event', col: 7, words: 'Guest Leaves' },
      ),
    ).toEqual(['command_not_imperative c', 'event_not_past_tense e4']);
  });

  it('stands the tense checks down on a board that is not written in English past tense', () => {
    expect(
      codes(
        { id: 'c', kind: 'command', col: 0, words: 'Bestelling plaatsen' },
        { id: 'a', kind: 'actor', col: 0, lane: 1, words: 'Klant' },
        { id: 'e', kind: 'domain-event', col: 1, words: 'Bestelling geplaatst' },
      ),
    ).toEqual([]);
  });

  it('runs no tense checks when no event has words', () => {
    expect(codes({ id: 'e', kind: 'domain-event', col: 0, words: '' })).toEqual([
      'event_without_cause e',
      'blank_note e',
    ]);
  });
});

describe('gaps: questions', () => {
  it('finds moments of one kind saying the same words, ignoring case and punctuation, never things', () => {
    const gaps = gapsOf(
      { id: 'x1', kind: 'command', col: 0, words: 'Pay Order' },
      { id: 'x2', kind: 'command', col: 3, words: ' pay  order! ' },
      { id: 'g2', kind: 'aggregate', col: 9, words: 'Stripe' },
      { id: 'g', kind: 'aggregate', col: 6, words: 'Stripe' },
    );
    expect(gaps.filter((g) => g.code === 'duplicate_note')).toEqual([
      {
        code: 'duplicate_note',
        level: 'question',
        ids: ['x1', 'x2'],
        message: '"Pay Order" appears 2 times as a command',
        remedy: null,
      },
    ]);
  });

  it('lists every hotspot as open', () => {
    expect(gapsOf({ id: 'h', kind: 'hotspot', col: 0, words: 'Refunds?' })).toMatchObject([
      { code: 'open_hotspot', level: 'question', message: '"Refunds?" is still open' },
    ]);
  });
});

describe('gaps: order', () => {
  it('follows the timeline, then the code order', () => {
    const order = codes(
      { id: 'late', kind: 'domain-event', col: 4, words: 'Order Shipped' },
      { id: 'early', kind: 'domain-event', col: 0, words: 'Order Placed' },
      { id: 'h', kind: 'hotspot', col: 0.2, words: 'Who?' },
    );
    expect(order).toEqual([
      'event_without_cause early',
      'open_hotspot h',
      'event_without_cause late',
    ]);
    const all: GapCode[] = ['event_without_cause'];
    expect(all).toHaveLength(1);
  });
});

describe('gaps: tense edge cases', () => {
  const english = (extra: NoteSpec): string[] =>
    codes(
      { id: 'e1', kind: 'domain-event', col: 0, words: 'Order Placed' },
      { id: 'e2', kind: 'domain-event', col: 2, words: 'Order Paid' },
      extra,
    ).filter((c) => c.startsWith('event_not') || c.startsWith('command_not'));

  it('does not take a short word ending in ed for past tense', () => {
    expect(english({ id: 'e3', kind: 'domain-event', col: 4, words: 'Room Bed' })).toEqual([
      'event_not_past_tense e3',
    ]);
  });

  it('reads words without letters as no tense at all', () => {
    expect(english({ id: 'e3', kind: 'domain-event', col: 4, words: '42' })).toEqual([
      'event_not_past_tense e3',
    ]);
    expect(english({ id: 'c', kind: 'command', col: 5, words: '#1' })).toEqual([]);
  });

  it('reads a note with no label as blank', () => {
    const reading = readBoard(
      board({ id: 'e', kind: 'domain-event', col: 0, extra: { label: undefined } }),
    );
    expect(reading.notes[0]!.words).toBe('');
  });
});
