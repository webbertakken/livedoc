// docs/specs/021-event-storming/board-language.md "Terms".
import { describe, expect, it } from 'vitest';
import { boardTerms } from './language';
import { readBoard } from './reading';
import { board } from './testing';

const context = (id: string, notes: string[]) =>
  ({
    id,
    type: 'shape',
    shape: 'square',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    label: id,
    esContext: { notes },
  }) as never;

const terms = (...specs: Parameters<typeof board>) => boardTerms(readBoard(board(...specs)));

describe('boardTerms', () => {
  it('finds the words two or more notes share, most used first, then by name', () => {
    const found = terms(
      { id: 'e1', kind: 'domain-event', col: 0, words: 'Order Placed' },
      { id: 'e2', kind: 'domain-event', col: 1, words: 'Order Paid' },
      { id: 'e3', kind: 'domain-event', col: 2, words: 'Meal Paid' },
      { id: 'c1', kind: 'command', col: 0, lane: 1, words: 'Place Order' },
    );
    expect(found.map((t) => [t.term, t.notes])).toEqual([
      ['Order', ['c1', 'e1', 'e2']],
      ['Paid', ['e2', 'e3']],
    ]);
  });

  it('compares ignoring case and shows the casing most written', () => {
    const found = terms(
      { id: 'e1', kind: 'domain-event', col: 0, words: 'order placed' },
      { id: 'e2', kind: 'domain-event', col: 1, words: 'Order Paid' },
      { id: 'e3', kind: 'domain-event', col: 2, words: 'Order Sent' },
    );
    expect(found.map((t) => t.term)).toEqual(['Order']);
    expect(found[0]!.key).toBe('order');
  });

  it('shows the first casing in reading order on a tie', () => {
    const found = terms(
      { id: 'e1', kind: 'domain-event', col: 0, words: 'order placed' },
      { id: 'e2', kind: 'domain-event', col: 1, words: 'Order Paid' },
    );
    expect(found[0]!.term).toBe('order');
  });

  it('counts a plain plural as its singular, when the singular is on the board', () => {
    const found = terms(
      { id: 'e1', kind: 'domain-event', col: 0, words: 'Order Placed' },
      { id: 'e2', kind: 'domain-event', col: 1, words: 'Orders Archived' },
      { id: 'e3', kind: 'domain-event', col: 2, words: 'Status Changed' },
      { id: 'e4', kind: 'domain-event', col: 3, words: 'Status Read' },
    );
    expect(found.map((t) => t.term)).toEqual(['Order', 'Status']);
  });

  it('counts a note once however often it says the word', () => {
    const found = terms(
      { id: 'e1', kind: 'domain-event', col: 0, words: 'Order for Order Sent' },
      { id: 'e2', kind: 'domain-event', col: 1, words: 'Parcel Sent' },
    );
    expect(found.map((t) => [t.term, t.notes.length])).toEqual([['Sent', 2]]);
  });

  it('leaves out short words, stop words and blank notes', () => {
    const found = terms(
      { id: 'e1', kind: 'domain-event', col: 0, words: 'ID of the Order Set' },
      { id: 'e2', kind: 'domain-event', col: 1, words: 'ID of the Parcel Set' },
      { id: 'e3', kind: 'domain-event', col: 2, words: '' },
    );
    expect(found.map((t) => t.term)).toEqual(['Set']);
  });

  it('knows the contexts a term is used in, and how many of its notes are in none', () => {
    const found = boardTerms(
      readBoard(
        board(
          { id: 'e1', kind: 'domain-event', col: 0, words: 'Order Placed' },
          { id: 'e2', kind: 'domain-event', col: 1, words: 'Order Cooked' },
          { id: 'e3', kind: 'domain-event', col: 2, words: 'Order Billed' },
          context('ordering', ['e1']),
          context('kitchen', ['e2']),
        ),
      ),
    );
    expect(found).toEqual([
      {
        term: 'Order',
        key: 'order',
        notes: ['e1', 'e2', 'e3'],
        contexts: ['ordering', 'kitchen'],
        outside: 1,
      },
    ]);
  });

  it('finds none on an empty board', () => {
    expect(terms()).toEqual([]);
  });
});
