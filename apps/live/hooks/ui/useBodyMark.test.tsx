// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBodyMark } from './useBodyMark';

const marked = () => document.body.hasAttribute('data-mode-message-shown');

describe('useBodyMark', () => {
  it('marks the body while it is on, and clears the mark when it goes', () => {
    const hook = renderHook(({ on }) => useBodyMark('mode-message-shown', on), {
      initialProps: { on: true },
    });
    expect(marked()).toBe(true);
    hook.rerender({ on: false });
    expect(marked()).toBe(false);
    hook.rerender({ on: true });
    hook.unmount();
    expect(marked()).toBe(false);
  });

  it('keeps the mark while any of its holders is on', () => {
    const a = renderHook(() => useBodyMark('mode-message-shown', true));
    const b = renderHook(() => useBodyMark('mode-message-shown', true));
    a.unmount();
    expect(marked()).toBe(true);
    b.unmount();
    expect(marked()).toBe(false);
  });

  it('leaves the body alone while off', () => {
    renderHook(() => useBodyMark('mode-message-shown', false));
    expect(marked()).toBe(false);
  });
});
