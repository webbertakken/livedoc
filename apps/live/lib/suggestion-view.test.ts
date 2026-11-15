// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ARRANGE_KEY,
  SUGGESTION_PREVIEW_LEAVE_MS,
  changeKey,
  contextsKey,
  endSuggestionPreview,
  leaveSuggestion,
  nameKey,
  parsePreviewKey,
  planKey,
  previewSuggestion,
  termKey,
  previewedContextIds,
  setShowAllSuggestions,
  setSuggestionsPanelOpen,
  startArranging,
  stopArranging,
  suggestionViewFor,
  useSuggestionView,
} from './suggestion-view';

// The person's own view of a board's suggestions (docs/specs/021-event-storming/suggestions.md "How a person sees
// them"): Show All off and the panel collapsed whenever a board opens.

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  endSuggestionPreview('reset');
  setShowAllSuggestions('reset', false);
  vi.useRealTimers();
});

describe('suggestion view', () => {
  it('opens a board with Show All off and the panel collapsed', () => {
    expect(suggestionViewFor('t1')).toEqual({
      tabId: 't1',
      showAll: false,
      panelOpen: false,
      previewKey: null,
      arranging: false,
    });
  });

  it('keeps a board its view, and forgets it when another board opens', () => {
    setShowAllSuggestions('t1', true);
    setSuggestionsPanelOpen('t1', true);
    expect(suggestionViewFor('t1')).toMatchObject({ showAll: true, panelOpen: true });
    expect(suggestionViewFor('t2')).toMatchObject({ showAll: false, panelOpen: false });
    setSuggestionsPanelOpen('t2', false);
    expect(suggestionViewFor('t1')).toMatchObject({ showAll: false, panelOpen: false });
  });

  it('ends a preview a beat after the pointer leaves, unless it comes back', () => {
    previewSuggestion('t1', 'e:before');
    leaveSuggestion('t1', 'e:before');
    vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS - 1);
    previewSuggestion('t1', 'e:before');
    vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS);
    expect(suggestionViewFor('t1').previewKey).toBe('e:before');
    leaveSuggestion('t1', 'e:before');
    vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS);
    expect(suggestionViewFor('t1').previewKey).toBeNull();
  });

  it('lets a newer preview outlive the leave of an older one', () => {
    previewSuggestion('t1', 'a');
    leaveSuggestion('t1', 'a');
    previewSuggestion('t1', 'b');
    leaveSuggestion('t1', 'a');
    vi.advanceTimersByTime(SUGGESTION_PREVIEW_LEAVE_MS);
    expect(suggestionViewFor('t1').previewKey).toBe('b');
  });

  it('renders the view for the board it is asked about', () => {
    const { result } = renderHook(() => useSuggestionView('t3'));
    expect(result.current.showAll).toBe(false);
    act(() => setShowAllSuggestions('t3', true));
    expect(result.current.showAll).toBe(true);
    act(() => setShowAllSuggestions('t4', false));
    expect(result.current.showAll).toBe(false);
  });
});

// What a preview key names (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides").
describe('preview keys', () => {
  it('names a note change by its place on the note, in the scope of its context unless said', () => {
    expect(parsePreviewKey(changeKey('n1', 0))).toEqual({
      type: 'change',
      noteId: 'n1',
      index: 0,
      scope: 'context',
    });
    expect(parsePreviewKey(changeKey('n:1', 2, 'board'))).toEqual({
      type: 'change',
      noteId: 'n:1',
      index: 2,
      scope: 'board',
    });
  });

  it('names a chip by its name and the contexts it is for', () => {
    expect(parsePreviewKey(nameKey(['c1'], 'Order taking'))).toEqual({
      type: 'name',
      name: 'Order taking',
      contextIds: ['c1'],
    });
    expect(parsePreviewKey(nameKey(['c1', 'c:2'], 'Checkout'))).toEqual({
      type: 'name',
      name: 'Checkout',
      contextIds: ['c1', 'c:2'],
    });
  });

  it('names the contexts a row of names is for', () => {
    expect(parsePreviewKey(contextsKey(['c1', 'c2']))).toEqual({
      type: 'contexts',
      contextIds: ['c1', 'c2'],
    });
  });

  it('answers null for a hint, a suggestion, a context, nothing and a key that does not parse', () => {
    for (const key of [
      'e1:after',
      's:p1',
      'c:c1',
      null,
      'x:not json',
      'x:[1]',
      'n:[]',
      'n:{}',
      'n:["Name", 1]',
      'g:[]',
      'g:[1]',
      't:[]',
      't:["order"]',
      't:["order", "ticket", "context"]',
      't:["order", "ticket", "elsewhere", null]',
    ])
      expect(parsePreviewKey(key)).toBeNull();
  });

  it('names a renamed term, and how far the rename reaches', () => {
    expect(parsePreviewKey(termKey('order', 'ticket', { type: 'board' }))).toEqual({
      type: 'term',
      from: 'order',
      to: 'ticket',
      scope: { type: 'board' },
    });
    expect(parsePreviewKey(termKey('order', 'the "pass"', { type: 'none' }))).toEqual({
      type: 'term',
      from: 'order',
      to: 'the "pass"',
      scope: { type: 'none' },
    });
    expect(parsePreviewKey(termKey('order', 'ticket', { type: 'context', id: 'c:1' }))).toEqual({
      type: 'term',
      from: 'order',
      to: 'ticket',
      scope: { type: 'context', id: 'c:1' },
    });
  });

  it('says which contexts a preview brings forward', () => {
    expect(previewedContextIds('c:c1')).toEqual(['c1']);
    expect(previewedContextIds(contextsKey(['c1', 'c2']))).toEqual(['c1', 'c2']);
    expect(previewedContextIds(nameKey(['c1'], 'Sales'))).toEqual(['c1']);
    for (const key of [null, 's:p1', changeKey('n1')]) expect(previewedContextIds(key)).toEqual([]);
  });
});

// docs/specs/021-event-storming/lane-plans.md "How a person sees and decides", arrange.md "How a person arranges".
describe('board offers', () => {
  it('names a lane plan by its element, and arranging by itself', () => {
    expect(parsePreviewKey(planKey('plan-1'))).toEqual({ type: 'lane-plan', planId: 'plan-1' });
    expect(parsePreviewKey(ARRANGE_KEY)).toEqual({ type: 'arrange' });
    expect(parsePreviewKey('p:')).toBeNull();
    expect(previewedContextIds(planKey('plan-1'))).toEqual([]);
    expect(previewedContextIds(ARRANGE_KEY)).toEqual([]);
  });

  it('arranges one board at a time, and stops when asked or when another board opens', () => {
    expect(suggestionViewFor('a').arranging).toBe(false);
    startArranging('a');
    expect(suggestionViewFor('a').arranging).toBe(true);
    // A hover preview comes and goes beneath it.
    previewSuggestion('a', 's:1');
    endSuggestionPreview('a');
    expect(suggestionViewFor('a').arranging).toBe(true);
    expect(suggestionViewFor('b').arranging).toBe(false);
    stopArranging('a');
    expect(suggestionViewFor('a').arranging).toBe(false);
    startArranging('a');
    setSuggestionsPanelOpen('b', true);
    expect(suggestionViewFor('a').arranging).toBe(false);
  });

  it('tells a reader when arranging starts and stops', () => {
    const { result } = renderHook(() => useSuggestionView('a'));
    act(() => startArranging('a'));
    expect(result.current.arranging).toBe(true);
    act(() => stopArranging('a'));
    expect(result.current.arranging).toBe(false);
  });
});
