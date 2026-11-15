// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELATIVE_TICK_MS, useRelativeNow } from './relative-time';

// docs/specs/016-platform/web-performance.md "Work only when it can change what shows": the shared clock behind
// every "5 min ago" holds still while the page is hidden, and catches up the moment it shows again.

let renders = 0;
function Row() {
  useRelativeNow();
  renders += 1;
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
  renders = 0;
});

afterEach(() => {
  setHidden(false);
  vi.useRealTimers();
});

describe('useRelativeNow', () => {
  it('ticks while the page shows', () => {
    const view = render(<Row />);
    renders = 0;
    act(() => vi.advanceTimersByTime(RELATIVE_TICK_MS));
    act(() => vi.advanceTimersByTime(RELATIVE_TICK_MS));
    expect(renders).toBe(2);
    view.unmount();
  });

  it('renders nothing while the page is hidden, and catches up when it shows', () => {
    const view = render(<Row />);
    renders = 0;
    act(() => setHidden(true));
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(RELATIVE_TICK_MS));
    expect(renders).toBe(0);
    act(() => setHidden(false));
    expect(renders).toBe(1);
    act(() => vi.advanceTimersByTime(RELATIVE_TICK_MS));
    expect(renders).toBe(2);
    view.unmount();
  });
});
