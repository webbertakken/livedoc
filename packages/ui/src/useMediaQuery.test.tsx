// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './useMediaQuery';

// Reading a media query asks the browser to bring style and layout up to date, so on a canvas whose every element
// reads one (apps/live docs/specs/008-canvas/canvas-performance.md "A gesture frame never reads layout after
// writing it"), a render that read it per element forced a layout of the whole board in the middle of a press.
// The match is read once per query and kept, and the browser's change event updates it.

type Listener = () => void;

function fakeMatchMedia(initial: boolean) {
  const listeners = new Set<Listener>();
  let matches = initial;
  const list = {
    get matches() {
      reads.count += 1;
      return matches;
    },
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
  };
  const reads = { count: 0 };
  const matchMedia = vi.fn(() => list);
  vi.stubGlobal('matchMedia', matchMedia);
  return {
    matchMedia,
    reads,
    flip(next: boolean) {
      matches = next;
      for (const cb of listeners) cb();
    },
  };
}

function Reader({ id }: { id: string }) {
  return <span data-id={id}>{useMediaQuery('(max-width: 640px)') ? 'phone' : 'desk'}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('reads the browser once for many readers of one query, however often they render', () => {
    const media = fakeMatchMedia(false);
    const board = (n: number) => (
      <>
        {Array.from({ length: n }, (_, i) => (
          <Reader key={i} id={String(i)} />
        ))}
      </>
    );
    const { rerender } = render(board(50));
    rerender(board(50));
    rerender(board(50));
    expect(media.matchMedia).toHaveBeenCalledTimes(1);
    expect(media.reads.count).toBe(1);
  });

  it('follows the query as it starts and stops matching', () => {
    const media = fakeMatchMedia(false);
    const { container } = render(<Reader id="a" />);
    expect(container.textContent).toBe('desk');
    act(() => media.flip(true));
    expect(container.textContent).toBe('phone');
    act(() => media.flip(false));
    expect(container.textContent).toBe('desk');
  });

  it('reads as no match where the browser has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { container } = render(<Reader id="a" />);
    expect(container.textContent).toBe('desk');
  });
});
