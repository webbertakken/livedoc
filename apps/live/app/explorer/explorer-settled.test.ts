// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  afterExplorerSettled,
  EXPLORER_SETTLE_TIMEOUT_MS,
  markExplorerSettled,
  resetExplorerSettledForTests,
  settlesWithItsLists,
} from './explorer-settled';

describe('settlesWithItsLists', () => {
  it('is true for a section drawn from the Explorer’s lists', () => {
    for (const kind of ['recent', 'all', 'folder', 'favourites', 'shared', 'trash', 'team']) {
      expect(settlesWithItsLists(kind), kind).toBe(true);
    }
  });

  // Home reads its own data and, on a first run, fetches its welcome once the lists land: it says when it has drawn.
  it('is false for Home, which says so itself', () => {
    expect(settlesWithItsLists('home')).toBe(false);
  });
});

// docs/specs/016-platform/web-performance.md "What is fetched ahead waits for the page's own reads".
describe('afterExplorerSettled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetExplorerSettledForTests();
  });
  afterEach(() => vi.useRealTimers());

  it('holds what is fetched ahead until the Explorer’s documents are listed', () => {
    const start = vi.fn(() => () => {});
    afterExplorerSettled(start);
    vi.advanceTimersByTime(EXPLORER_SETTLE_TIMEOUT_MS - 1);
    expect(start).not.toHaveBeenCalled();

    markExplorerSettled();

    expect(start).toHaveBeenCalledOnce();
  });

  it('starts at once when the Explorer has already settled', () => {
    markExplorerSettled();
    const start = vi.fn(() => () => {});

    afterExplorerSettled(start);

    expect(start).toHaveBeenCalledOnce();
  });

  it('starts anyway once the wait runs out, so a read that never lands holds nothing back for good', () => {
    const start = vi.fn(() => () => {});
    afterExplorerSettled(start);

    vi.advanceTimersByTime(EXPLORER_SETTLE_TIMEOUT_MS);
    markExplorerSettled();

    expect(start).toHaveBeenCalledOnce();
  });

  it('cancels the wait, and what it started, with the effect that asked', () => {
    const stopStarted = vi.fn();
    const waiting = vi.fn(() => () => {});
    const cancelWaiting = afterExplorerSettled(waiting);
    cancelWaiting();
    markExplorerSettled();
    expect(waiting).not.toHaveBeenCalled();

    const cancelStarted = afterExplorerSettled(() => stopStarted);
    cancelStarted();

    expect(stopStarted).toHaveBeenCalledOnce();
  });
});
