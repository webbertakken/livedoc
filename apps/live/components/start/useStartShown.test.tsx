// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { showStart } from './start-shown';
import { useStartShown } from './useStartShown';

afterEach(() => localStorage.clear());

function Probe() {
  return <i>{String(useStartShown('t:diagram'))}</i>;
}

describe('useStartShown', () => {
  it('follows a start as it is asked for', () => {
    const { result } = renderHook(() => useStartShown('t:diagram'));
    expect(result.current).toBe(false);
    act(() => showStart('t:diagram'));
    expect(result.current).toBe(true);
  });

  it('renders closed on the server', () => {
    showStart('t:diagram');
    expect(renderToString(<Probe />)).toContain('false');
  });
});
