// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTextThreadArrival } from './useTextThreadArrival';

// inbox.md §1.8: each hand-over is a new ask, even for the same thread.
describe('useTextThreadArrival', () => {
  it('holds the thread handed over, counting each ask', () => {
    const { result } = renderHook(() => useTextThreadArrival());
    expect(result.current.textThreadArrival).toBeNull();
    act(() => result.current.openTextThread('t1', 'th1'));
    expect(result.current.textThreadArrival).toEqual({ tabId: 't1', threadId: 'th1', n: 1 });
    act(() => result.current.openTextThread('t1', 'th1'));
    expect(result.current.textThreadArrival).toEqual({ tabId: 't1', threadId: 'th1', n: 2 });
  });
});
