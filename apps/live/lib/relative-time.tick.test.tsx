// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELATIVE_TICK_MS, useRelativeNow } from './relative-time';

// docs/specs/016-platform/web-performance.md "Work only when it can change what shows": the shared clock behind
// every "5 min ago" holds still while the page is hidden, and catches up the moment it shows again.

const rendered = vi.fn();
function Row() {
  useRelativeNow();
  rendered();
  return null;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  rendered.mockClear();
});

afterEach(() => {
  setHidden(false);
  vi.useRealTimers();
});

describe('useRelativeNow', () => {
  it('ticks while the page shows', () => {
    const view = render(<Row />);
    rendered.mockClear();
    act(() => {
      vi.advanceTimersByTime(RELATIVE_TICK_MS);
    });
    act(() => {
      vi.advanceTimersByTime(RELATIVE_TICK_MS);
    });
    expect(rendered).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('renders nothing while the page is hidden, and catches up when it shows', () => {
    const view = render(<Row />);
    rendered.mockClear();
    act(() => setHidden(true));
    for (let i = 0; i < 4; i++)
      act(() => {
        vi.advanceTimersByTime(RELATIVE_TICK_MS);
      });
    expect(rendered).toHaveBeenCalledTimes(0);
    act(() => setHidden(false));
    expect(rendered).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(RELATIVE_TICK_MS);
    });
    expect(rendered).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
