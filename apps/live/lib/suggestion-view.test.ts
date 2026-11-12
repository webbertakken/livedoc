// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUGGESTION_PREVIEW_LEAVE_MS,
  endSuggestionPreview,
  leaveSuggestion,
  previewSuggestion,
  setShowAllSuggestions,
  setSuggestionsPanelOpen,
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
