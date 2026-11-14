import { describe, expect, it } from 'vitest';
import { newContextElement, type EsNoteChange } from '@livedoc/document';
import {
  KIND,
  REMOVE,
  REWORD,
  SPLIT,
  byId,
  changed,
  note,
  orderFlow,
} from './change-board.fixture';
import { changeCaption, changeSummary } from './change-caption';

// What a suggested note change says of itself (docs/specs/021-event-storming/suggested-changes.md "How a person sees
// and decides"): what changes, how far a reword reaches, the reason and who suggested it.

describe('changeCaption', () => {
  it('says a reword’s words, how many notes of its context it rewords and how many more hold the term', () => {
    const board = changed(orderFlow(), 'pack', REWORD);
    expect(changeCaption(board, 'pack', REWORD)).toEqual({
      title: 'Reword',
      what: '“Pack parcel”',
      ripple: 'Also rewords 2 notes in Fulfilment · 3 more on the board',
      everywhere: true,
      reason: 'The warehouse handles a parcel.',
      by: 'Claude',
    });
  });

  it('counts one note as one, and says nothing of a board that holds the term nowhere else', () => {
    const change: EsNoteChange = {
      change: 'reword',
      words: 'Refund the booking',
      term: 'order',
      to: 'booking',
    };
    const board = orderFlow().filter(
      (el) => !['pack', 'packed', 'sent', 'fulfilment'].includes(el.id),
    );
    const inOrdering = changed(board, 'place', { ...change, words: 'Place booking' });
    expect(changeCaption(inOrdering, 'place', { ...change, words: 'Place booking' })).toMatchObject(
      {
        ripple: 'Also rewords 1 note in Ordering · 1 more on the board',
        everywhere: true,
      },
    );
    const alone = changed(
      board.filter((el) => el.id === 'refund'),
      'refund',
      change,
    );
    expect(changeCaption(alone, 'refund', change)).toMatchObject({
      ripple: null,
      everywhere: false,
    });
  });

  it('speaks of the notes outside any context for a note in none', () => {
    const board = [...orderFlow(), note('late', 'Order is late', 4)];
    const change: EsNoteChange = {
      change: 'reword',
      words: 'Refund the booking',
      term: 'order',
      to: 'booking',
    };
    expect(changeCaption(changed(board, 'refund', change), 'refund', change).ripple).toBe(
      'Also rewords 1 note outside any context · 5 more on the board',
    );
  });

  it('says when the context is renamed with its notes, or alone', () => {
    const board = orderFlow().map((el) =>
      el.id === 'fulfilment' ? { ...el, label: 'Order handling' } : el,
    );
    expect(changeCaption(changed(board, 'pack', REWORD), 'pack', REWORD).ripple).toBe(
      'Also rewords 2 notes in Order handling and its name · 3 more on the board',
    );
    const solo = [
      note('pack', 'Pack order', 0),
      newContextElement({ id: 'c', name: 'Order desk', notes: [note('pack', 'Pack order', 0)] }),
    ];
    expect(changeCaption(changed(solo, 'pack', REWORD), 'pack', REWORD).ripple).toBe(
      'Also renames Order desk',
    );
  });

  it('says how many more notes hold the term when its own context holds no other', () => {
    const board = orderFlow().filter((el) => el.id !== 'packed' && el.id !== 'sent');
    expect(changeCaption(changed(board, 'pack', REWORD), 'pack', REWORD).ripple).toBe(
      '3 more notes on the board hold “Order”',
    );
  });

  it('says nothing of a ripple for a reword that names no term', () => {
    const change: EsNoteChange = { change: 'reword', words: 'Parcel sent' };
    expect(changeCaption(changed(orderFlow(), 'sent', change), 'sent', change)).toEqual({
      title: 'Reword',
      what: '“Parcel sent”',
      ripple: null,
      everywhere: false,
    });
  });

  it('names the kind a note would become, a split’s parts and the note a removal takes', () => {
    const board = orderFlow();
    expect(changeCaption(board, 'refund', KIND)).toMatchObject({
      title: 'Change kind',
      what: 'Command',
      reason: 'It asks.',
    });
    expect(changeCaption(board, 'packed', SPLIT)).toMatchObject({
      title: 'Split',
      what: '“Order packed” · “Order shipped”',
    });
    expect(changeCaption(board, 'sent', REMOVE)).toMatchObject({
      title: 'Remove',
      what: '“Order was shipped”',
      by: 'Claude',
    });
  });
});

describe('changeSummary', () => {
  it('reads a change in one line, for a label', () => {
    expect(changeSummary(byId(orderFlow(), 'pack'), REWORD)).toBe('Reword “Pack parcel”');
    expect(changeSummary(byId(orderFlow(), 'refund'), KIND)).toBe('Change kind Command');
    expect(changeSummary(byId(orderFlow(), 'sent'), REMOVE)).toBe('Remove “Order was shipped”');
  });
});
