// docs/specs/021-event-storming/lane-plans.md "What must stay true".
import { describe, expect, it } from 'vitest';
import { board } from '../testing';
import { readingChanges, sayReadingChange } from './same-reading';

describe('the board says the same', () => {
  const before = board(
    { id: 'pay', kind: 'command', col: 0, lane: 0 },
    { id: 'paid', kind: 'domain-event', col: 0, lane: 1 },
    { id: 'shipped', kind: 'domain-event', col: 2, lane: 1 },
    { id: 'buyer', kind: 'actor', col: 0, lane: 4 },
  );

  it('finds no change between a board and itself', () => {
    expect(readingChanges(before, before)).toEqual({ changes: [], gained: 0 });
  });

  it('names a relation the board would lose', () => {
    const after = board(
      { id: 'pay', kind: 'command', col: 0, lane: 0 },
      { id: 'paid', kind: 'domain-event', col: 0, lane: 3 },
      { id: 'shipped', kind: 'domain-event', col: 2, lane: 3 },
      { id: 'buyer', kind: 'actor', col: 0, lane: 6 },
    );
    expect(readingChanges(before, after).changes).toEqual([
      { relation: 'causes', from: 'pay', was: 'paid', now: null },
    ]);
  });

  it('names a relation that would point at another note', () => {
    const after = board(
      { id: 'pay', kind: 'command', col: 2, lane: 0 },
      { id: 'paid', kind: 'domain-event', col: 0, lane: 1 },
      { id: 'shipped', kind: 'domain-event', col: 2, lane: 1 },
      { id: 'buyer', kind: 'actor', col: 0, lane: 4 },
    );
    expect(readingChanges(before, after).changes).toEqual([
      { relation: 'causes', from: 'pay', was: 'paid', now: 'shipped' },
    ]);
  });

  it('counts a loose note that finds a partner, and refuses nothing for it', () => {
    const after = board(
      { id: 'pay', kind: 'command', col: 0, lane: 0 },
      { id: 'paid', kind: 'domain-event', col: 0, lane: 1 },
      { id: 'shipped', kind: 'domain-event', col: 2, lane: 1 },
      { id: 'buyer', kind: 'actor', col: 0, lane: 2 },
    );
    expect(readingChanges(before, after)).toEqual({ changes: [], gained: 1 });
  });

  it('names two events that would change their order', () => {
    const after = board(
      { id: 'pay', kind: 'command', col: 3, lane: 0 },
      { id: 'paid', kind: 'domain-event', col: 3, lane: 1 },
      { id: 'shipped', kind: 'domain-event', col: 2, lane: 1 },
      { id: 'buyer', kind: 'actor', col: 0, lane: 4 },
    );
    expect(readingChanges(before, after).changes).toEqual([
      { relation: 'order', from: 'shipped', was: 'paid', now: null },
    ]);
  });

  it('lists the changes along the timeline, a note’s relations in the reading’s order', () => {
    const was = board(
      { id: 'rule', kind: 'policy', col: 1, lane: 0 },
      { id: 'pay', kind: 'command', col: 2, lane: 0 },
      { id: 'ordered', kind: 'domain-event', col: 0, lane: 1 },
      { id: 'paid', kind: 'domain-event', col: 3, lane: 1 },
    );
    const now = board(
      { id: 'rule', kind: 'policy', col: 1, lane: 0 },
      { id: 'pay', kind: 'command', col: 2, lane: 0 },
      { id: 'ordered', kind: 'domain-event', col: 0, lane: 5 },
      { id: 'paid', kind: 'domain-event', col: 3, lane: 5 },
    );
    expect(readingChanges(was, now).changes).toEqual([
      { relation: 'triggers', from: 'rule', was: 'ordered', now: null },
      { relation: 'causes', from: 'pay', was: 'paid', now: null },
    ]);
  });
});

describe('a change to what the board says, in words', () => {
  const subject = (id: string) => `<${id}>`;
  const partner = (id: string) => `[${id}]`;

  it('says a relation lost, and where it would point instead', () => {
    expect(
      sayReadingChange(
        { relation: 'causes', from: 'pay', was: 'paid', now: null },
        subject,
        partner,
      ),
    ).toBe('<pay> would no longer cause [paid]');
    expect(
      sayReadingChange(
        { relation: 'triggers', from: 'notify', was: 'paid', now: 'sent' },
        subject,
        partner,
      ),
    ).toBe('<notify> would no longer be triggered by [paid] (now [sent])');
  });

  it('says two events in another order', () => {
    expect(
      sayReadingChange(
        { relation: 'order', from: 'sent', was: 'paid', now: null },
        subject,
        partner,
      ),
    ).toBe('<sent> would read before [paid], which it follows');
  });
});
