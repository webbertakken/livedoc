// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useTextDocumentThreadArrival,
  type TextDocumentThreadArrival,
} from './useTextDocumentThreadArrival';

// inbox.md §1.8: the surface goes to an Inbox row's thread once it is ready, once per ask.
describe('useTextDocumentThreadArrival', () => {
  function arriving(initial: { arrival: TextDocumentThreadArrival | null; ready: boolean }) {
    const arrive = vi.fn();
    const hook = renderHook((p: typeof initial) => useTextDocumentThreadArrival({ ...p, arrive }), {
      initialProps: initial,
    });
    return { arrive, hook };
  }

  it('waits for the surface to be ready, then goes once', () => {
    const arrival = { threadId: 'th1', n: 1 };
    const { arrive, hook } = arriving({ arrival, ready: false });
    expect(arrive).not.toHaveBeenCalled();
    hook.rerender({ arrival, ready: true });
    hook.rerender({ arrival, ready: true });
    expect(arrive).toHaveBeenCalledTimes(1);
    expect(arrive).toHaveBeenCalledWith('th1');
  });

  it('goes again for the next ask, and does nothing with none', () => {
    const { arrive, hook } = arriving({ arrival: null, ready: true });
    expect(arrive).not.toHaveBeenCalled();
    hook.rerender({ arrival: { threadId: 'th1', n: 1 }, ready: true });
    hook.rerender({ arrival: { threadId: 'th1', n: 2 }, ready: true });
    expect(arrive).toHaveBeenCalledTimes(2);
  });
});
