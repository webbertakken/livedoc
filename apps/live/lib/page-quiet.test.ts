// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIET_MAX_WAIT_MS, QUIET_MS, afterPageQuiet } from './page-quiet';

// A stand-in for the browser's long-task observer: the test reports long tasks through `longTask`.
let report: ((entries: { startTime: number; duration: number }[]) => void) | null = null;
class FakeObserver {
  static supportedEntryTypes = ['longtask'];
  constructor(cb: (list: { getEntries: () => unknown[] }) => void) {
    report = (entries) => cb({ getEntries: () => entries });
  }
  observe() {}
  disconnect() {
    report = null;
  }
}
const longTask = () => report?.([{ startTime: performance.now(), duration: 80 }]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('PerformanceObserver', FakeObserver);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  report = null;
});

describe('afterPageQuiet', () => {
  it('runs once the page has had no long task for the quiet window', () => {
    const run = vi.fn();
    afterPageQuiet(run);
    vi.advanceTimersByTime(QUIET_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it('starts the window again at each long task', () => {
    const run = vi.fn();
    afterPageQuiet(run);
    vi.advanceTimersByTime(QUIET_MS - 100);
    longTask();
    vi.advanceTimersByTime(QUIET_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
    expect(report).toBeNull();
  });

  it('runs at the longest wait on a page that never goes quiet', () => {
    const run = vi.fn();
    afterPageQuiet(run);
    for (let t = 0; t < QUIET_MAX_WAIT_MS; t += 100) {
      longTask();
      vi.advanceTimersByTime(100);
    }
    expect(run).toHaveBeenCalledOnce();
  });

  it('never runs once cancelled', () => {
    const run = vi.fn();
    afterPageQuiet(run)();
    vi.advanceTimersByTime(QUIET_MAX_WAIT_MS);
    expect(run).not.toHaveBeenCalled();
    expect(report).toBeNull();
  });

  it('waits the quiet window alone where long tasks cannot be watched', () => {
    vi.stubGlobal('PerformanceObserver', undefined);
    const run = vi.fn();
    afterPageQuiet(run);
    vi.advanceTimersByTime(QUIET_MS);
    expect(run).toHaveBeenCalledOnce();
  });
});
