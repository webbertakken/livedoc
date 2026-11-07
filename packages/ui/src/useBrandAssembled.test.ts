// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRAND_ASSEMBLE_MS, useBrandAssembled } from './useBrandAssembled';

// docs/specs/004-interface-design/brand-mark.md: once per page load.
describe('useBrandAssembled', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.brandAssembled;
  });

  it('marks the page assembled once the assembly has played', () => {
    vi.useFakeTimers();
    renderHook(() => useBrandAssembled(true));
    expect(document.documentElement.dataset.brandAssembled).toBeUndefined();
    vi.advanceTimersByTime(BRAND_ASSEMBLE_MS);
    expect(document.documentElement.dataset.brandAssembled).toBe('');
  });

  it('does nothing for a logo that does not assemble', () => {
    vi.useFakeTimers();
    renderHook(() => useBrandAssembled(false));
    vi.advanceTimersByTime(BRAND_ASSEMBLE_MS);
    expect(document.documentElement.dataset.brandAssembled).toBeUndefined();
  });

  it('lasts as long as the assembly', () => {
    expect(BRAND_ASSEMBLE_MS).toBe(1700);
  });
});
