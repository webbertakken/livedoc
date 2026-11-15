// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Element } from '@livedoc/document';
import { clearLocalPreview } from '@/lib/drag-preview';
import {
  closeReview,
  openReview,
  resetReviewViewForTests,
  setReviewRings,
} from '@/lib/review-view';
import { ReviewRings } from './ReviewRings';

// What the Review panel points out on the board (docs/specs/021-event-storming/board-review.md "Check").

const TAB = 'tab-1';
const note = (id: string, x: number): Element => ({
  id,
  type: 'sticky',
  x,
  y: 40,
  width: 200,
  height: 200,
  label: id,
  esKind: 'domain-event',
});
const board = [note('a', 0), note('b', 400)];
const rings = () => [...document.querySelectorAll<HTMLElement>('[data-review-ring]')];

function draw() {
  return render(
    <div>
      {board.map((el) => (
        <div key={el.id} data-element-id={el.id} />
      ))}
      <ReviewRings tabId={TAB} elements={board} />
    </div>,
  );
}

afterEach(() => {
  cleanup();
  clearLocalPreview();
  resetReviewViewForTests();
});

describe('ReviewRings', () => {
  it('draws nothing until the panel rings a note', () => {
    draw();
    expect(rings()).toEqual([]);
  });

  it('rings each note named, a little off its box, as decoration', () => {
    draw();
    act(() => {
      openReview(TAB);
      setReviewRings(TAB, ['b']);
    });
    const [ring, ...rest] = rings();
    expect(rest).toEqual([]);
    expect(ring!.dataset.reviewRing).toBe('b');
    expect(ring!.getAttribute('aria-hidden')).toBe('true');
    expect(ring!.style.left).toBe('394px');
    expect(ring!.style.top).toBe('34px');
    expect(ring!.style.width).toBe('212px');
    expect(document.documentElement.hasAttribute('data-review-dim')).toBe(false);
  });

  it('dims the rest of the board round a chosen term’s notes, and puts it back', () => {
    draw();
    act(() => {
      openReview(TAB);
      setReviewRings(TAB, ['a'], true);
    });
    expect(document.documentElement.hasAttribute('data-review-dim')).toBe(true);
    expect(document.querySelector('[data-element-id="a"]')!.hasAttribute('data-review-lit')).toBe(
      true,
    );
    expect(document.querySelector('[data-element-id="b"]')!.hasAttribute('data-review-lit')).toBe(
      false,
    );
    act(() => closeReview(TAB));
    expect(rings()).toEqual([]);
    expect(document.documentElement.hasAttribute('data-review-dim')).toBe(false);
    expect(document.querySelector('[data-element-id="a"]')!.hasAttribute('data-review-lit')).toBe(
      false,
    );
  });
});
