// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefetchOnceQuiet, prefetchWhenIdle } from './idle-prefetch';
import { QUIET_MS } from './page-quiet';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('prefetchWhenIdle', () => {
  it('runs each loader once the page is idle, and only once per page', () => {
    let idle: () => void = () => {};
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => ((idle = cb), 1));
    vi.stubGlobal('cancelIdleCallback', () => {});
    const load = vi.fn(async () => ({}));
    prefetchWhenIdle([load]);
    expect(load).not.toHaveBeenCalled();
    idle();
    prefetchWhenIdle([load]);
    idle();
    expect(load).toHaveBeenCalledOnce();
  });

  it('never runs once cancelled, and swallows a failed load', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    const cancelled = vi.fn(async () => ({}));
    prefetchWhenIdle([cancelled])();
    prefetchWhenIdle([failing]);
    vi.runAllTimers();
    expect(cancelled).not.toHaveBeenCalled();
    expect(failing).toHaveBeenCalledOnce();
  });
});

describe('prefetchOnceQuiet', () => {
  it('waits for the page to go quiet, then for an idle moment', () => {
    vi.useFakeTimers();
    vi.stubGlobal('PerformanceObserver', undefined);
    let idle: () => void = () => {};
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => ((idle = cb), 1));
    vi.stubGlobal('cancelIdleCallback', () => {});
    const load = vi.fn(async () => ({}));
    prefetchOnceQuiet([load]);
    idle();
    expect(load).not.toHaveBeenCalled();
    vi.advanceTimersByTime(QUIET_MS);
    idle();
    expect(load).toHaveBeenCalledOnce();
  });

  it('fetches nothing once cancelled, before or after the page went quiet', () => {
    vi.useFakeTimers();
    vi.stubGlobal('PerformanceObserver', undefined);
    const cancelIdle = vi.fn();
    vi.stubGlobal('requestIdleCallback', () => 7);
    vi.stubGlobal('cancelIdleCallback', cancelIdle);
    const early = vi.fn(async () => ({}));
    prefetchOnceQuiet([early])();
    vi.advanceTimersByTime(QUIET_MS);
    const late = vi.fn(async () => ({}));
    const cancel = prefetchOnceQuiet([late]);
    vi.advanceTimersByTime(QUIET_MS);
    cancel();
    expect(cancelIdle).toHaveBeenCalledWith(7);
    expect(early).not.toHaveBeenCalled();
    expect(late).not.toHaveBeenCalled();
  });
});
