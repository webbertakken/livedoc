// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastBlankOf, useLastBlank, writeLastBlank } from './last-blank';

// docs/specs/013-workspace/new-document-menu.md "The button"
describe('last blank', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('is Diagram before any blank was made', () => {
    expect(lastBlankOf(null)).toBe('diagram');
  });

  it('reads an unknown stored blank as Diagram', () => {
    expect(lastBlankOf('dashboard')).toBe('diagram');
  });

  it('follows the blank made last', () => {
    const { result } = renderHook(() => useLastBlank());
    expect(result.current).toBe('diagram');
    act(() => writeLastBlank('spreadsheet'));
    expect(result.current).toBe('spreadsheet');
  });

  it('keeps the blank for the session when local storage refuses it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useLastBlank());
    act(() => writeLastBlank('form'));
    expect(result.current).toBe('form');
  });
});
