// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAnswer, type Tab } from '@livedoc/document';
import type { ReviewActions } from '@/hooks/canvas/useReviewActions';
import { REVIEW_BOARD_IDS as IDS, reviewBoardElements } from '@/lib/review-board.fixture';
import { REVIEW_TAB_KEY, resetReviewViewForTests, reviewViewFor } from '@/lib/review-view';
import { resetStructureViewForTests } from '@/lib/structure-view';
import { ReviewButton } from './ReviewButton';
import { ReviewHost } from './ReviewHost';

// Where the Review panel stands, on the seeded kitchen (docs/specs/021-event-storming/board-review.md "The panel").

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const board = (elements = reviewBoardElements()): Tab => ({
  id: 't',
  name: 'Kitchen',
  kind: 'event-storming',
  elements,
});

function draw({ mayWrite = true } = {}) {
  const acts = {
    addForGap: vi.fn<ReviewActions['addForGap']>(),
    renameTerm: vi.fn<ReviewActions['renameTerm']>(),
  };
  const reveal = vi.fn();
  const inert = new Set<string>();
  const tree = (tab: Tab) => (
    <>
      <ReviewButton tabId="t" />
      <ReviewHost tab={tab} acts={acts} inertIds={inert} reveal={reveal} mayWrite={mayWrite} />
    </>
  );
  const view = render(tree(board()));
  return { acts, reveal, redraw: (tab: Tab) => view.rerender(tree(tab)) };
}

const pill = () => screen.getByRole('button', { name: 'Review' });
const card = () => screen.queryByRole('complementary', { name: 'Review' });
const openCard = () => {
  fireEvent.click(pill());
  return card()!;
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  resetReviewViewForTests();
  resetStructureViewForTests();
});

describe('ReviewHost', () => {
  it('draws nothing until the panel is opened', () => {
    draw();
    expect(card()).toBeNull();
  });

  it('opens as a card under the corner, on Check the first time, the keyboard on its tab', () => {
    draw();
    const panel = openCard();
    expect(panel.className).toContain('fixed right-3');
    expect(panel.className).toContain('w-[360px]');
    const check = within(panel).getByRole('tab', { name: 'Check' });
    expect(check.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(check);
    expect(within(panel).getByRole('status').textContent).toBe(
      '5 events · 3 gaps · 1 open hotspot · 3 events outside a context',
    );
  });

  it('opens on the tab last open on this device', () => {
    window.localStorage.setItem(REVIEW_TAB_KEY, 'story');
    draw();
    const story = within(openCard()).getByRole('tab', { name: 'Story' });
    expect(story.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(story);
  });

  it('closes with Escape and gives the keyboard back to its pill', () => {
    draw();
    const panel = openCard();
    fireEvent.keyDown(within(panel).getByRole('tab', { name: 'Check' }), { key: 'Escape' });
    expect(card()).toBeNull();
    expect(reviewViewFor('t').open).toBe(false);
    expect(document.activeElement).toBe(pill());
  });

  it('lets a chosen term go on the first Escape, and closes on the next', () => {
    draw();
    const panel = openCard();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Language' }));
    const term = within(panel).getByRole('button', { name: /^order/i });
    fireEvent.click(term);
    expect(reviewViewFor('t').dim).toBe(true);
    fireEvent.keyDown(term, { key: 'Escape' });
    expect(card()).not.toBeNull();
    expect(reviewViewFor('t').dim).toBe(false);
    fireEvent.keyDown(term, { key: 'Escape' });
    expect(card()).toBeNull();
  });

  it('offers Add, Answer and Rename Term to an Editor, and hands Add to the acts', () => {
    const { acts } = draw();
    const panel = openCard();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Add a command before Table cleared' }),
    );
    expect(acts.addForGap).toHaveBeenCalledTimes(1);
    expect(within(panel).getByRole('button', { name: /^Answer/ })).toBeTruthy();
  });

  it('lets someone who only reads walk all three tabs, with nothing to write', () => {
    draw({ mayWrite: false });
    const panel = openCard();
    expect(within(panel).queryByRole('button', { name: /^Add / })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /^Answer/ })).toBeNull();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Language' }));
    fireEvent.click(within(panel).getByRole('button', { name: /^order/i }));
    expect(within(panel).queryByRole('button', { name: 'Rename Term' })).toBeNull();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Story' }));
    expect(within(panel).getAllByRole('option').length).toBeGreaterThan(0);
  });

  it('follows the board: an answered hotspot is a gap no longer', () => {
    const { redraw } = draw();
    const panel = openCard();
    act(() => redraw(board(setAnswer(reviewBoardElements(), IDS.sentBack, 'Remake it'))));
    expect(within(panel).getByRole('status').textContent).toBe(
      '5 events · 3 gaps · 3 events outside a context',
    );
  });
});
