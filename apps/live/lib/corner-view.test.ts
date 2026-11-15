// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { askViewFor, openAsk, resetAskViewForTests } from '@/lib/ask-view';
import { clearCornerFor } from '@/lib/corner-view';
import { openReview, resetReviewViewForTests, reviewViewFor } from '@/lib/review-view';
import { setSuggestionsPanelOpen, suggestionViewFor } from '@/lib/suggestion-view';

// One thing open in the corner (docs/specs/021-event-storming/board-review.md "The panel").

const TAB = 't';
const openAll = () => {
  openAsk(TAB, { type: 'board' });
  setSuggestionsPanelOpen(TAB, true);
  openReview(TAB);
};
const open = () => ({
  ask: askViewFor(TAB).open,
  list: suggestionViewFor(TAB).panelOpen,
  review: reviewViewFor(TAB).open,
});

afterEach(() => {
  resetAskViewForTests();
  resetReviewViewForTests();
  setSuggestionsPanelOpen(TAB, false);
});

describe('clearCornerFor', () => {
  it('closes the list and the panel for an ask', () => {
    openAll();
    clearCornerFor(TAB, 'ask');
    expect(open()).toEqual({ ask: true, list: false, review: false });
  });

  it('closes the ask and the panel for the list', () => {
    openAll();
    clearCornerFor(TAB, 'list');
    expect(open()).toEqual({ ask: false, list: true, review: false });
  });

  it('closes the ask and folds the list for the panel', () => {
    openAll();
    clearCornerFor(TAB, 'review');
    expect(open()).toEqual({ ask: false, list: false, review: true });
  });

  it('leaves another board’s corner as it is', () => {
    openReview(TAB);
    clearCornerFor('other', 'ask');
    expect(reviewViewFor(TAB).open).toBe(true);
  });
});
