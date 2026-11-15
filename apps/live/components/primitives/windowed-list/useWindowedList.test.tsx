// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaceStore, type PlaceStore } from './list-places';
import { CASCADE_SETTLE_MS, useWindowedList, type WindowedListOptions } from './useWindowedList';
import { WindowGap, windowChildren } from './WindowGap';

// jsdom lays nothing out, so rows are laid out here: the list starts 200 px down the page, every row is 50 px and a
// gap is as tall as its style says.
const LIST_TOP = 200;
const ROW = 50;
let scrollY = 0;

function layOut() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    let top = LIST_TOP - scrollY;
    if (this.tagName === 'LI') {
      let prev = this.previousElementSibling as HTMLElement | null;
      while (prev) {
        top += prev.dataset.windowGap !== undefined ? parseFloat(prev.style.height) : ROW;
        prev = prev.previousElementSibling as HTMLElement | null;
      }
    }
    return {
      top,
      bottom: top + ROW,
      left: 0,
      right: 0,
      width: 0,
      height: ROW,
      x: 0,
      y: top,
      toJSON: () => ({}),
    };
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ROW);
  vi.spyOn(window, 'scrollTo').mockImplementation(((_x: number, y: number) => {
    scrollY = y;
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  }) as typeof window.scrollTo);
}

function scrollTo(y: number) {
  act(() => {
    window.scrollTo(0, y);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
  });
}

const keysOf = (n: number) => Array.from({ length: n }, (_, i) => `k-${i}`);

function List(props: Partial<WindowedListOptions> & { keys: readonly string[] }) {
  const w = useWindowedList({ estimateStride: ROW, aria: { kind: 'list' }, ...props });
  return (
    <ul ref={w.listRef} onFocus={w.onFocus} data-cascading={w.cascading} aria-label="Rows">
      {windowChildren(
        w.segments,
        (i) => (
          <li key={props.keys[i]}>
            <button type="button">{props.keys[i]}</button>
          </li>
        ),
        (height) => (
          <WindowGap as="li" height={height} />
        ),
      )}
    </ul>
  );
}

const drawnNames = () => screen.queryAllByRole('button').map((b) => b.textContent);

describe('useWindowedList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    scrollY = 0;
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    layOut();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('draws a short list whole', () => {
    render(<List keys={keysOf(40)} />);
    expect(drawnNames()).toHaveLength(40);
  });

  it('draws the rows near the view of a long one, and room for the rest', () => {
    const { container } = render(<List keys={keysOf(1000)} />);
    const names = drawnNames();
    expect(names[0]).toBe('k-0');
    expect(names.length).toBeLessThanOrEqual(40);
    const gap = container.querySelector<HTMLElement>('[data-window-gap]')!;
    expect(gap.getAttribute('aria-hidden')).toBe('true');
    expect(parseFloat(gap.style.height)).toBe((1000 - names.length) * ROW);
  });

  it('draws the rows that scroll into view and drops the ones that leave', () => {
    render(<List keys={keysOf(1000)} />);
    scrollTo(30000);
    const names = drawnNames();
    expect(names).toContain('k-596');
    expect(names).not.toContain('k-0');
    expect(names.length).toBeLessThanOrEqual(60);
  });

  it('says each row’s place in the whole list', () => {
    render(<List keys={keysOf(1000)} />);
    scrollTo(30000);
    const row = screen.getByRole('button', { name: 'k-596' }).closest('li')!;
    expect(row.getAttribute('aria-setsize')).toBe('1000');
    expect(row.getAttribute('aria-posinset')).toBe('597');
  });

  it('keeps the focused row drawn while the list scrolls away from it', () => {
    render(<List keys={keysOf(1000)} />);
    act(() => screen.getByRole('button', { name: 'k-3' }).focus());
    scrollTo(30000);
    expect(drawnNames()).toContain('k-3');
    expect(document.activeElement?.textContent).toBe('k-3');
  });

  it('always draws the leading entries', () => {
    render(<List keys={keysOf(1000)} leading={2} />);
    scrollTo(30000);
    expect(drawnNames().slice(0, 2)).toEqual(['k-0', 'k-1']);
  });

  it('plays the cascade on the first draw only', () => {
    const { container } = render(<List keys={keysOf(1000)} />);
    expect(container.querySelector('ul')!.dataset.cascading).toBe('true');
    act(() => vi.advanceTimersByTime(CASCADE_SETTLE_MS));
    expect(container.querySelector('ul')!.dataset.cascading).toBe('false');
  });

  describe('its place', () => {
    let store: PlaceStore;
    let saved: string | null;
    beforeEach(() => {
      saved = null;
      store = createPlaceStore({ read: () => saved, write: (v) => (saved = v) });
    });

    it('is written down when the scroll rests', () => {
      render(<List keys={keysOf(1000)} place={{ key: 'folder-a', store, restore: false }} />);
      scrollTo(30020);
      act(() => vi.advanceTimersByTime(200));
      expect(store.read('folder-a')).toEqual({
        anchorId: 'k-596',
        anchorOffset: 20,
        scrollTop: 30020,
      });
    });

    it('is taken back on Back, on the row it was anchored to', () => {
      store.write('folder-a', { anchorId: 'k-596', anchorOffset: 20, scrollTop: 1 });
      const keys = ['new-1', 'new-2', ...keysOf(1000)];
      render(<List keys={keys} place={{ key: 'folder-a', store, restore: true }} />);
      expect(window.scrollY).toBe(LIST_TOP + 598 * ROW + 20);
      expect(drawnNames()).toContain('k-596');
    });

    it('is left alone when the list was opened anew', () => {
      store.write('folder-a', { anchorId: 'k-596', anchorOffset: 20, scrollTop: 30020 });
      render(<List keys={keysOf(1000)} place={{ key: 'folder-a', store, restore: false }} />);
      expect(window.scrollY).toBe(0);
    });
  });
});
