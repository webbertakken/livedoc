import { describe, expect, it } from 'vitest';
import {
  dismissNameSuggestions,
  newContextElement,
  type Element,
  type StickyElement,
  type Tab,
} from '@livedoc/document';
import { KIND, REWORD, byId, changed, named, note, orderFlow } from './change-board.fixture';
import {
  declinedEverything,
  declinedNames,
  declinedSuggestions,
  dismissedTab,
} from './suggestion-declined';

// What a person's dismissal is remembered as (docs/specs/021-event-storming/asks.md "What was declined").

const suggestion = (id: string, label: string, anchorId: string): StickyElement => ({
  ...note(id, label, 9, 'policy'),
  esSuggestion: { anchorId, side: 'after' },
});

function withSuggestions(): Element[] {
  const board = orderFlow();
  return [
    ...board,
    suggestion('s1', 'Notify the customer', 'sent'),
    suggestion('s2', 'Ask for a review', 's1'),
    newContextElement({
      id: 'refunds',
      name: 'Refunds',
      notes: [byId(board, 'refund')],
      suggestion: { reason: 'Its own part.' },
    }),
  ];
}

describe('declinedSuggestions', () => {
  it('remembers a dismissed suggestion and those chained on it, about the note the chain grows from', () => {
    expect(declinedSuggestions(withSuggestions(), ['s1'])).toEqual([
      { type: 'note', words: 'Notify the customer', kind: 'policy', about: ['sent'] },
      { type: 'note', words: 'Ask for a review', kind: 'policy', about: ['sent'] },
    ]);
  });

  it('remembers a dismissed suggested context about its notes', () => {
    expect(declinedSuggestions(withSuggestions(), ['refunds'])).toEqual([
      { type: 'context', words: 'Refunds', about: ['refund'] },
    ]);
  });

  it('remembers nothing for a note, a kept context or something gone', () => {
    expect(declinedSuggestions(withSuggestions(), ['sent', 'ordering', 'nowhere'])).toEqual([]);
  });
});

describe('declinedNames', () => {
  it('remembers every name shown for a selection, or only those named', () => {
    const board = named(orderFlow(), ['ordering'], 'Order taking', 'Sales');
    expect(declinedNames(board, ['ordering'])).toEqual([
      { type: 'name', words: 'Order taking', about: ['ordering'] },
      { type: 'name', words: 'Sales', about: ['ordering'] },
    ]);
    expect(declinedNames(board, ['ordering'], ['sales'])).toEqual([
      { type: 'name', words: 'Sales', about: ['ordering'] },
    ]);
  });

  it('remembers a merge’s name about the contexts it was for', () => {
    const board = named(orderFlow(), ['ordering', 'fulfilment'], 'Shop');
    const [entry] = declinedNames(board, ['fulfilment', 'ordering']);
    expect(entry).toMatchObject({ type: 'name', words: 'Shop' });
    expect([...entry!.about].sort()).toEqual(['fulfilment', 'ordering']);
    // The names for one of them alone are another selection's.
    expect(declinedNames(board, ['ordering'])).toEqual([]);
  });
});

describe('declinedEverything', () => {
  it('remembers every open suggestion: notes, contexts, names and note changes', () => {
    const board = changed(
      named(named(withSuggestions(), ['ordering'], 'Sales'), ['ordering', 'fulfilment'], 'Shop'),
      'pack',
      REWORD,
      KIND,
    );
    expect(declinedEverything(board).map((d) => [d.type, d.words ?? d.kind])).toEqual([
      ['note', 'Notify the customer'],
      ['note', 'Ask for a review'],
      ['context', 'Refunds'],
      ['name', 'Sales'],
      ['name', 'Shop'],
      ['reword', 'Pack parcel'],
      ['kind', 'command'],
    ]);
  });

  it('remembers nothing on a board with nothing open', () => {
    expect(declinedEverything(orderFlow())).toEqual([]);
  });
});

describe('dismissedTab', () => {
  const tabOf = (elements: Element[]) => ({ id: 't', elements }) as Tab;

  it('answers the tab after a dismissal: the board without it, and the dismissal remembered', () => {
    const tab = tabOf(named(orderFlow(), ['ordering'], 'Sales'));
    const out = dismissedTab(
      tab,
      (els) => dismissNameSuggestions(els, ['ordering']),
      (els) => declinedNames(els, ['ordering']),
    );
    expect(out.elements).toEqual(orderFlow());
    expect(out.esDeclined).toEqual([{ type: 'name', words: 'Sales', about: ['ordering'] }]);
  });

  it('answers the same tab, remembering nothing, when nothing was dismissed', () => {
    const tab = tabOf(orderFlow());
    const out = dismissedTab(
      tab,
      (els) => dismissNameSuggestions(els, ['ordering']),
      () => [{ type: 'name', words: 'Sales', about: ['ordering'] }],
    );
    expect(out).toBe(tab);
  });
});
