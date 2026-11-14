import { describe, expect, it } from 'vitest';
import {
  candidateContexts,
  isSuggestion,
  nameSuggestionsFor,
  noteChangesOf,
  type CandidateContextElement,
  type Element,
} from '@livedoc/document';
import {
  KIND,
  REMOVE,
  REWORD,
  SPLIT,
  STEP,
  byId,
  changed,
  named,
  orderFlow,
} from './change-board.fixture';
import {
  acceptNoteChange,
  applyFirstChanges,
  withoutSuggestedChanges,
} from './suggested-changes-apply';

// Accepting a suggested change on the board (docs/specs/021-event-storming/suggested-changes.md "Accepting"): each
// answers the board after it, so the act is one commit and one Undo.

const ids = () => {
  let n = 0;
  return () => `part-${(n += 1)}`;
};
const opts = () => ({ inertIds: new Set<string>(), makeId: ids() });
const label = (els: Element[], id: string) => byId(els, id).label;

describe('acceptNoteChange', () => {
  it('rewords the note and the notes of its context that hold the term, and no further', () => {
    const board = changed(orderFlow(), 'pack', REWORD);
    const out = acceptNoteChange(board, 'pack', REWORD, 'context', opts());
    expect(['pack', 'packed', 'sent', 'placed'].map((id) => label(out.elements, id))).toEqual([
      'Pack parcel',
      'Parcel packed and shipped',
      'Parcel was shipped',
      'Order placed',
    ]);
    expect(noteChangesOf(byId(out.elements, 'pack'))).toEqual([]);
    expect(out.added).toBe(0);
  });

  it('rewords every note that holds the term when asked for the whole board', () => {
    const board = changed(orderFlow(), 'pack', REWORD);
    const out = acceptNoteChange(board, 'pack', REWORD, 'board', opts());
    expect(['place', 'placed', 'refund'].map((id) => label(out.elements, id))).toEqual([
      'Place parcel',
      'Parcel placed',
      'Refund the parcel',
    ]);
  });

  it('changes a note’s kind as Change Kind does', () => {
    const out = acceptNoteChange(
      changed(orderFlow(), 'refund', KIND),
      'refund',
      KIND,
      'context',
      opts(),
    );
    expect(byId(out.elements, 'refund').esKind).toBe('command');
    expect(noteChangesOf(byId(out.elements, 'refund'))).toEqual([]);
  });

  it('removes a note as Delete does', () => {
    const out = acceptNoteChange(
      changed(orderFlow(), 'sent', REMOVE),
      'sent',
      REMOVE,
      'context',
      opts(),
    );
    expect(out.elements.some((el) => el.id === 'sent')).toBe(false);
  });

  it('lands a split’s further parts after the note as ordinary notes of its kind, in its context', () => {
    const board = changed(orderFlow(), 'packed', SPLIT, REMOVE);
    const out = acceptNoteChange(board, 'packed', SPLIT, 'context', opts());
    const packed = byId(out.elements, 'packed');
    const part = byId(out.elements, 'part-1');
    expect(packed.label).toBe('Order packed');
    expect(part).toMatchObject({ label: 'Order shipped', esKind: 'domain-event', y: packed.y });
    expect(isSuggestion(part)).toBe(false);
    expect(part.x).toBe(packed.x + STEP);
    // The note after it stood aside to make room.
    expect(byId(out.elements, 'sent').x).toBe(8 * STEP);
    expect(byId<CandidateContextElement>(out.elements, 'fulfilment').esContext.notes).toEqual([
      'pack',
      'packed',
      'sent',
      'part-1',
    ]);
    // The note's other changes stay for the person to decide.
    expect(noteChangesOf(packed)).toEqual([REMOVE]);
    expect(out.added).toBe(1);
  });

  it('lands a split’s parts in no context for a note in none', () => {
    const out = acceptNoteChange(
      changed(orderFlow(), 'refund', SPLIT),
      'refund',
      SPLIT,
      'context',
      opts(),
    );
    expect(byId(out.elements, 'part-1').label).toBe('Order shipped');
    expect(candidateContexts(out.elements).some((c) => c.esContext.notes.includes('part-1'))).toBe(
      false,
    );
  });

  it('answers the same board when the note no longer holds that change', () => {
    const board = orderFlow();
    for (const change of [REWORD, KIND, SPLIT, REMOVE])
      expect(acceptNoteChange(board, 'pack', change, 'context', opts())).toEqual({
        elements: board,
        added: 0,
      });
  });
});

describe('applyFirstChanges', () => {
  it('takes each context’s first name for itself and each note’s first change', () => {
    const board = changed(
      changed(named(orderFlow(), ['ordering'], 'Order taking', 'Sales'), 'pack', REWORD),
      'packed',
      SPLIT,
      REMOVE,
    );
    const out = applyFirstChanges(board, opts());
    expect(byId(out.elements, 'ordering').label).toBe('Order taking');
    expect(nameSuggestionsFor(out.elements, ['ordering'])).toEqual([]);
    expect(label(out.elements, 'pack')).toBe('Pack parcel');
    // The reword rippled through Fulfilment before the split took its turn; the split's own words then land.
    expect(label(out.elements, 'packed')).toBe('Order packed');
    expect(label(out.elements, 'part-1')).toBe('Order shipped');
    expect(noteChangesOf(byId(out.elements, 'packed'))).toEqual([REMOVE]);
    expect(out).toMatchObject({ names: 1, changes: 2, added: 1 });
  });

  it('leaves a merge’s name for the person to choose', () => {
    const board = named(orderFlow(), ['ordering', 'fulfilment'], 'Shop');
    const out = applyFirstChanges(board, opts());
    expect(out.elements).toBe(board);
    expect(out).toMatchObject({ names: 0, changes: 0, added: 0 });
  });
});

describe('withoutSuggestedChanges', () => {
  it('drops every name suggestion and every note change, the contexts and the notes staying', () => {
    const board = changed(
      named(named(orderFlow(), ['ordering'], 'Sales'), ['ordering', 'fulfilment'], 'Shop'),
      'pack',
      REWORD,
      KIND,
    );
    const out = withoutSuggestedChanges(board);
    expect(out.map((el) => el.id)).toEqual(board.map((el) => el.id));
    expect(nameSuggestionsFor(out, ['ordering'])).toEqual([]);
    expect(nameSuggestionsFor(out, ['ordering', 'fulfilment'])).toEqual([]);
    expect(noteChangesOf(byId(out, 'pack'))).toEqual([]);
  });

  it('answers the same board when it holds none', () => {
    const board = orderFlow();
    expect(withoutSuggestedChanges(board)).toBe(board);
  });
});
