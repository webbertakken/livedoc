// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFER_GLIDE_LINGER_MS, useOfferGlide } from './useOfferGlide';

// docs/specs/021-event-storming/arrange.md "How a person arranges": the notes glide to where they would stand, and
// back.

const gliding = () => document.documentElement.hasAttribute('data-offer-glide');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useOfferGlide', () => {
  it('eases the board while an offer is drawn, and a beat after it ends', () => {
    const { rerender, unmount } = renderHook(({ offered }) => useOfferGlide(offered), {
      initialProps: { offered: false },
    });
    expect(gliding()).toBe(false);
    rerender({ offered: true });
    expect(gliding()).toBe(true);
    rerender({ offered: false });
    expect(gliding()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(OFFER_GLIDE_LINGER_MS);
    });
    expect(gliding()).toBe(false);
    rerender({ offered: true });
    unmount();
    expect(gliding()).toBe(false);
  });
});
