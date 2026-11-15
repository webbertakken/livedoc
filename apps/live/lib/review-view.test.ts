import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REVIEW_TAB_KEY,
  closeReview,
  openReview,
  resetReviewViewForTests,
  reviewViewFor,
  setReviewRings,
  setReviewTab,
} from './review-view';

// The Review panel as one person has it (docs/specs/021-event-storming/board-review.md "The panel").

const kept = new Map<string, string>();
beforeEach(() => {
  kept.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => void kept.set(k, v),
    },
  });
});
afterEach(() => {
  resetReviewViewForTests();
  vi.unstubAllGlobals();
});

describe('the review view', () => {
  it('is closed to begin with, and on any other board', () => {
    expect(reviewViewFor('t')).toMatchObject({ open: false, tab: 'check', ringed: [], dim: false });
    openReview('t');
    expect(reviewViewFor('t').open).toBe(true);
    expect(reviewViewFor('other').open).toBe(false);
  });

  it('opens on Check the first time, and on the tab last open after', () => {
    openReview('t');
    expect(reviewViewFor('t').tab).toBe('check');
    setReviewTab('t', 'story');
    expect(kept.get(REVIEW_TAB_KEY)).toBe('story');
    closeReview('t');
    openReview('t');
    expect(reviewViewFor('t').tab).toBe('story');
  });

  it('opens on Check when what was kept is no tab, or nothing can be read', () => {
    kept.set(REVIEW_TAB_KEY, 'elsewhere');
    openReview('t');
    expect(reviewViewFor('t').tab).toBe('check');
    closeReview('t');
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
      },
    });
    openReview('t');
    expect(reviewViewFor('t').tab).toBe('check');
    setReviewTab('t', 'language');
    expect(reviewViewFor('t').tab).toBe('language');
  });

  it('rings notes while it is open, dimming the rest when asked, and lets go', () => {
    setReviewRings('t', ['a']);
    expect(reviewViewFor('t').ringed).toEqual([]);
    openReview('t');
    setReviewRings('t', ['a', 'b'], true);
    expect(reviewViewFor('t')).toMatchObject({ ringed: ['a', 'b'], dim: true });
    setReviewRings('t', []);
    expect(reviewViewFor('t')).toMatchObject({ ringed: [], dim: false });
  });

  it('publishes nothing for the rings it already shows', () => {
    openReview('t');
    setReviewRings('t', ['a']);
    const before = reviewViewFor('t');
    setReviewRings('t', ['a']);
    expect(reviewViewFor('t')).toBe(before);
  });

  it('lets the rings go with the tab that drew them, and with the panel', () => {
    openReview('t');
    setReviewRings('t', ['a'], true);
    setReviewTab('t', 'language');
    expect(reviewViewFor('t')).toMatchObject({ ringed: [], dim: false });
    setReviewRings('t', ['a']);
    closeReview('t');
    expect(reviewViewFor('t')).toMatchObject({ open: false, ringed: [] });
    openReview('t');
    expect(reviewViewFor('t').ringed).toEqual([]);
  });
});
