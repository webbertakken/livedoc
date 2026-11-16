// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askViewFor, openAsk, resetAskViewForTests } from '@/lib/ask-view';
import { closeReview, openReview, resetReviewViewForTests, reviewViewFor } from '@/lib/review-view';
import { setSuggestionsPanelOpen, suggestionViewFor } from '@/lib/suggestion-view';
import { ReviewButton, ReviewCorner } from './ReviewButton';

// The Review pill (docs/specs/021-event-storming/board-review.md "The panel").

const track = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({ track: (...a: Parameters<typeof track>) => track(...a) }));

const TAB = 't';
const pill = () => screen.getByRole('button', { name: 'Review' });

beforeEach(() => track.mockClear());
afterEach(() => {
  cleanup();
  resetAskViewForTests();
  resetReviewViewForTests();
  setSuggestionsPanelOpen(TAB, false);
});

describe('ReviewButton', () => {
  it('says whether the panel is open', () => {
    render(<ReviewButton tabId={TAB} />);
    expect(pill().getAttribute('aria-expanded')).toBe('false');
    act(() => openReview(TAB));
    expect(pill().getAttribute('aria-expanded')).toBe('true');
    act(() => closeReview(TAB));
    expect(pill().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the panel, counting it, and closes it when pressed again', () => {
    render(<ReviewButton tabId={TAB} />);
    fireEvent.click(pill());
    expect(reviewViewFor(TAB).open).toBe(true);
    expect(track).toHaveBeenCalledWith('Canvas', 'Used', 'ReviewOpened');
    fireEvent.click(pill());
    expect(reviewViewFor(TAB).open).toBe(false);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('takes the corner: the Ask popover closes and the list folds', () => {
    render(<ReviewButton tabId={TAB} />);
    act(() => {
      openAsk(TAB, { type: 'board' });
      setSuggestionsPanelOpen(TAB, true);
    });
    fireEvent.click(pill());
    expect(askViewFor(TAB).open).toBe(false);
    expect(suggestionViewFor(TAB).panelOpen).toBe(false);
  });

  it('closes the panel with Escape, and leaves Escape alone while it is closed', () => {
    render(<ReviewButton tabId={TAB} />);
    const closed = fireEvent.keyDown(pill(), { key: 'Escape' });
    expect(closed).toBe(true);
    fireEvent.click(pill());
    const open = fireEvent.keyDown(pill(), { key: 'Escape' });
    expect(open).toBe(false);
    expect(reviewViewFor(TAB).open).toBe(false);
  });

  it('leaves a selected context selected when pressed', () => {
    render(<ReviewButton tabId={TAB} />);
    expect(pill().hasAttribute('data-keeps-context-selection')).toBe(true);
  });
});

describe('ReviewCorner', () => {
  it('holds the pill alone, where the suggestions corner stands', () => {
    render(<ReviewCorner tabId={TAB} />);
    const corner = screen.getByTestId('review-corner');
    expect(corner.contains(pill())).toBe(true);
    expect(corner.className).toContain('fixed right-3');
    expect(corner.style.top).toBe('64px');
    expect(corner.className).toContain('rounded-full');
    expect(corner.querySelectorAll('button')).toHaveLength(1);
  });
});
