// @vitest-environment jsdom
// grid-and-editing.md "Formulas" (D141): Show › Formulas starts off and flips with each press.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useShowFormulas } from './show-formulas';

describe('useShowFormulas', () => {
  it('starts off and flips with each press', () => {
    const { result } = renderHook(() => useShowFormulas());
    expect(result.current.shown).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.shown).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.shown).toBe(false);
  });
});
