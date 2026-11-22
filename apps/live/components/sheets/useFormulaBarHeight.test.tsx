// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FORMULA_BAR_LINE_PX,
  formulaBarLines,
  formulaBarLinesMax,
  resetFormulaBarHeight,
  useFormulaBarHeight,
} from './useFormulaBarHeight';

afterEach(() => resetFormulaBarHeight());

function Handle({ input, height }: { input: string; height: number }) {
  const { lines, max, handle } = useFormulaBarHeight(input, height);
  return (
    <div role="separator" aria-valuenow={lines} aria-valuemax={max} tabIndex={0} {...handle} />
  );
}

// docs/specs/029-sheets/surface.md "Formula bar", D130.
describe('the formula bar’s height', () => {
  it('grows with its input up to three lines, then holds what was dragged, within a third of the grid', () => {
    expect(formulaBarLines('one', null, 10)).toBe(1);
    expect(formulaBarLines('a\nb\nc\nd\ne', null, 10)).toBe(3);
    expect(formulaBarLines('one', 8, 5)).toBe(5);
    expect(formulaBarLinesMax(FORMULA_BAR_LINE_PX * 3 * 4)).toBe(4);
    expect(formulaBarLinesMax(10)).toBe(1);
  });

  it('is set by a drag on its foot and by Up and Down, kept for the page, and given back by a double-click', () => {
    render(<Handle input="x" height={FORMULA_BAR_LINE_PX * 3 * 6} />);
    const bar = screen.getByRole('separator');
    expect(bar.getAttribute('aria-valuemax')).toBe('6');
    fireEvent.pointerDown(bar, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientY: 100 + FORMULA_BAR_LINE_PX * 2 });
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    fireEvent.pointerMove(bar, { clientY: 100 + FORMULA_BAR_LINE_PX * 20 });
    expect(bar.getAttribute('aria-valuenow')).toBe('6');
    fireEvent.pointerUp(bar);
    fireEvent.pointerMove(bar, { clientY: 0 });
    expect(bar.getAttribute('aria-valuenow')).toBe('6');
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect(bar.getAttribute('aria-valuenow')).toBe('5');
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect(bar.getAttribute('aria-valuenow')).toBe('6');
    fireEvent.keyDown(bar, { key: 'Enter' });
    const other = renderHook(() => useFormulaBarHeight('x', FORMULA_BAR_LINE_PX * 3 * 6));
    expect(other.result.current.lines).toBe(6);
    act(() => {
      fireEvent.doubleClick(bar);
    });
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
    for (let i = 0; i < 3; i++) fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
  });
});
