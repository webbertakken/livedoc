// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let settle: ((m: unknown) => void) | null = null;
const calls: string[] = [];
vi.mock('@/lib/element-kinds/families', () => ({
  KIND_FAMILY_LOADERS: {
    'event-storming': () => {
      calls.push('event-storming');
      return new Promise((resolve) => (settle = resolve));
    },
  },
  KIND_FAMILY_IDS: ['event-storming'],
}));

const { ReviewButton, useEventStormingFaces } = await import('./event-storming-faces');
const { KindFamilyNotLoaded, resetKindFamiliesForTests } =
  await import('@/lib/element-kinds/store');

afterEach(() => {
  resetKindFamiliesForTests();
  settle = null;
  calls.length = 0;
});

// docs/specs/016-platform/web-performance.md: suggestions, review and asks are the Event Storming family's.
describe('useEventStormingFaces', () => {
  it('asks for nothing off an Event Storming board', () => {
    const { result } = renderHook(() => useEventStormingFaces(false));
    expect(result.current).toBe(false);
    expect(calls).toEqual([]);
  });

  it('asks for the family on an Event Storming board and draws once it lands', async () => {
    const { result } = renderHook(() => useEventStormingFaces(true));
    expect(result.current).toBe(false);
    expect(calls).toEqual(['event-storming']);
    await act(async () => settle!({ ReviewButton: () => <i>review</i> }));
    expect(result.current).toBe(true);
  });
});

describe('the family’s faces', () => {
  it('draw the family’s own component once it is in', async () => {
    const { result } = renderHook(() => useEventStormingFaces(true));
    await act(async () => settle!({ ReviewButton: () => <i>review</i> }));
    expect(result.current).toBe(true);
    const { container } = render(<ReviewButton tabId="t" />);
    expect(container.innerHTML).toBe('<i>review</i>');
  });

  it('refuse to draw before the family is in', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ReviewButton tabId="t" />)).toThrow(KindFamilyNotLoaded);
  });
});
