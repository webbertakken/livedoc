// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  functionHelpHidden,
  resetFunctionHelp,
  toggleFunctionHelp,
  useFunctionHelpHidden,
} from './function-help-pref';

afterEach(() => {
  localStorage.clear();
  resetFunctionHelp();
});

// docs/specs/029-sheets/surface.md "Formula bar", D131.
describe('the function help card’s F1', () => {
  it('shows the card until F1, then keeps it hidden in the browser until F1 again', () => {
    const { result } = renderHook(() => useFunctionHelpHidden());
    expect(result.current).toBe(false);
    act(() => toggleFunctionHelp());
    expect(result.current).toBe(true);
    resetFunctionHelp();
    expect(functionHelpHidden()).toBe(true);
    act(() => toggleFunctionHelp());
    resetFunctionHelp();
    expect(functionHelpHidden()).toBe(false);
  });
});

describe('the help card on the server', () => {
  it('shows', async () => {
    const { renderToString } = await import('react-dom/server');
    const Probe = () => <>{String(useFunctionHelpHidden())}</>;
    expect(renderToString(<Probe />)).toBe('false');
  });
});
