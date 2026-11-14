// docs/specs/021-event-storming/asks.md "The topics" and "The three hands".
import { describe, expect, it } from 'vitest';
import { newContextElement, type Element, type StickyElement } from '@livedoc/document';
import { board, note } from '../testing';
import {
  STORM_ASKS,
  STORM_ASK_HANDS,
  STORM_ASK_TOPICS,
  askFits,
  askScopeOf,
  askTopicsFor,
  isAskScope,
  isAskTopic,
} from './catalogue';

const notes = () =>
  [
    note({ id: 'place', kind: 'command', col: 0 }),
    note({ id: 'placed', kind: 'domain-event', col: 1 }),
    note({ id: 'pay', kind: 'command', col: 2 }),
    note({ id: 'paid', kind: 'domain-event', col: 3 }),
  ] as StickyElement[];

function orderFlow(): Element[] {
  const [place, placed, pay, paid] = notes();
  return [
    place!,
    placed!,
    pay!,
    paid!,
    newContextElement({ id: 'ordering', name: 'Ordering', notes: [place!, placed!] }),
    newContextElement({
      id: 'payments',
      name: 'Payments',
      notes: [pay!, paid!],
      suggestion: { by: 'Claude' },
    }),
    {
      ...note({ id: 'maybe', kind: 'policy', col: 4 }),
      esSuggestion: { anchorId: 'paid', side: 'after' },
    } as Element,
    { id: 'title', type: 'text', x: 0, y: -200, width: 100, height: 40, label: 'Shop' },
  ];
}

describe('the catalogue of asks', () => {
  it('holds the six topics in menu order, each with its menu words and the lines it takes', () => {
    expect(STORM_ASK_TOPICS).toEqual(['gaps', 'contexts', 'names', 'merge', 'wording', 'lanes']);
    expect(STORM_ASK_TOPICS.map((t) => STORM_ASKS[t].menu)).toEqual([
      'Fill the Gaps',
      'Group into Contexts',
      'Suggest Names',
      'Name the Merge',
      'Sharpen the Wording',
      'Reorganise into Lanes',
    ]);
    expect(STORM_ASKS.wording.operations).toEqual([
      'suggest-reword',
      'suggest-kind',
      'suggest-split',
      'suggest-remove',
    ]);
    expect(STORM_ASKS.names.operations).toEqual(STORM_ASKS.merge.operations);
  });

  it('names the three hands, the CLI first', () => {
    expect(STORM_ASK_HANDS).toEqual(['cli', 'mcp', 'built-in']);
  });

  it('knows a topic from any other word', () => {
    expect(isAskTopic('lanes')).toBe(true);
    expect(isAskTopic('layout')).toBe(false);
    expect(isAskTopic(3)).toBe(false);
  });
});

describe('what an ask is about', () => {
  it('is the board when nothing is selected', () => {
    expect(askScopeOf(orderFlow(), { notes: [], contexts: [] })).toEqual({ type: 'board' });
  });

  it('is the selected workshop notes, and nothing else that was selected with them', () => {
    expect(
      askScopeOf(orderFlow(), { notes: ['place', 'title', 'maybe', 'gone', 'paid'], contexts: [] }),
    ).toEqual({ type: 'notes', ids: ['place', 'paid'] });
    expect(askScopeOf(orderFlow(), { notes: ['title', 'maybe'], contexts: [] })).toEqual({
      type: 'board',
    });
  });

  it('is one context, kept or suggested alike, or several; contexts win over notes', () => {
    expect(askScopeOf(orderFlow(), { notes: ['place'], contexts: ['payments'] })).toEqual({
      type: 'context',
      id: 'payments',
    });
    expect(
      askScopeOf(orderFlow(), { notes: [], contexts: ['payments', 'ordering', 'gone', 'place'] }),
    ).toEqual({ type: 'contexts', ids: ['payments', 'ordering'] });
  });

  it('offers each scope its topics', () => {
    expect(askTopicsFor({ type: 'board' })).toEqual(['gaps', 'contexts', 'wording', 'lanes']);
    expect(askTopicsFor({ type: 'notes', ids: ['place'] })).toEqual(['gaps', 'wording']);
    expect(askTopicsFor({ type: 'context', id: 'ordering' })).toEqual(['names', 'wording']);
    expect(askTopicsFor({ type: 'contexts', ids: ['ordering', 'payments'] })).toEqual(['merge']);
    expect(askFits('lanes', { type: 'board' })).toBe(true);
    expect(askFits('lanes', { type: 'notes', ids: ['place'] })).toBe(false);
  });

  it('tells a well-formed scope from anything else', () => {
    expect(isAskScope({ type: 'board' })).toBe(true);
    expect(isAskScope({ type: 'notes', ids: ['a', 'b'] })).toBe(true);
    expect(isAskScope({ type: 'context', id: 'x' })).toBe(true);
    expect(isAskScope({ type: 'contexts', ids: ['x', 'y'] })).toBe(true);
    for (const bad of [
      null,
      'board',
      { type: 'tab' },
      { type: 'notes', ids: [] },
      { type: 'notes', ids: ['a', 3] },
      { type: 'notes', ids: 'a' },
      { type: 'context' },
      { type: 'context', id: '' },
      { type: 'contexts', ids: ['x'] },
    ])
      expect(isAskScope(bad), JSON.stringify(bad)).toBe(false);
  });

  it('is unchanged by a board holding none of what was selected', () => {
    expect(askScopeOf(board().elements, { notes: ['place'], contexts: ['ordering'] })).toEqual({
      type: 'board',
    });
  });
});
