// @vitest-environment jsdom
// formatting.md "Borders" (D209): the border line is the spreadsheet's, kept as sheets are switched; a grid with no
// spreadsheet around it keeps its own, black and thin.
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BorderLineContext, useBorderLine, type BorderLineState } from './border-line-context';

describe('useBorderLine', () => {
  it('reads the spreadsheet’s line where there is one', () => {
    const shared: BorderLineState = [{ colour: '#ff0000', line: 'double' }, vi.fn()];
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BorderLineContext.Provider value={shared}>{children}</BorderLineContext.Provider>
    );
    const { result } = renderHook(() => useBorderLine(), { wrapper });
    expect(result.current).toBe(shared);
  });

  it('keeps its own, black and thin to start, where there is none', () => {
    const { result } = renderHook(() => useBorderLine());
    expect(result.current[0]).toEqual({ colour: '#000000', line: 'thin' });
    act(() => result.current[1]({ colour: '#000000', line: 'thick' }));
    expect(result.current[0].line).toBe('thick');
  });
});
