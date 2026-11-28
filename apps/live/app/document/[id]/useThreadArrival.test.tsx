// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useThreadArrival } from './useThreadArrival';

// inbox.md §1.8: each hand-over is a new ask, even for the same thread.
describe('useThreadArrival', () => {
  it('holds the thread handed over, counting each ask', () => {
    const { result } = renderHook(() => useThreadArrival());
    expect(result.current.threadArrival).toBeNull();
    act(() => result.current.openThread('t1', 'th1'));
    expect(result.current.threadArrival).toEqual({ tabId: 't1', threadId: 'th1', n: 1 });
    act(() => result.current.openThread('t1', 'th1'));
    expect(result.current.threadArrival).toEqual({ tabId: 't1', threadId: 'th1', n: 2 });
  });
});
