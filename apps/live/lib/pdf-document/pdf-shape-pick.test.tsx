// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The toolbar": Shape holds the seven shape tools behind
// its chevron and remembers the last one used, per person, in this browser, apart from Highlight's; Line until then.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resetShapePick,
  setShapePick,
  shapePick,
  SHAPE_TOOL_KINDS,
  useShapePick,
  isShapeTool,
  isPolyTool,
} from './pdf-shape-pick';
import { resetTextMarkPick, setTextMarkPick, textMarkPick } from './pdf-text-mark-pick';

afterEach(() => {
  localStorage.clear();
  resetShapePick();
  resetTextMarkPick();
});

describe('the shape tool the toolbar holds', () => {
  it('holds Line, Arrow, Rectangle, Ellipse, Polygon, Cloud and Connected lines in that order', () => {
    expect(SHAPE_TOOL_KINDS).toEqual([
      'line',
      'arrow',
      'rectangle',
      'ellipse',
      'polygon',
      'cloud',
      'polyline',
    ]);
    expect(['polygon', 'cloud', 'polyline', 'line'].map(isPolyTool)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(['line', 'ellipse', 'drawing', 'highlight'].map(isShapeTool)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('is Line until another is taken, and remembers the one taken apart from the text tool', () => {
    expect(shapePick()).toBe('line');
    setShapePick('ellipse');
    setTextMarkPick('underline');
    resetShapePick();
    resetTextMarkPick();
    expect(shapePick()).toBe('ellipse');
    expect(textMarkPick()).toBe('underline');
  });

  it('reads Line from a stored value that is none of its tools', () => {
    localStorage.setItem('livedoc:v2:pdf-shape-tool', 'highlight');
    expect(shapePick()).toBe('line');
  });

  it('tells its readers when the pick changes', () => {
    const { result } = renderHook(() => useShapePick());
    expect(result.current).toBe('line');
    act(() => setShapePick('arrow'));
    expect(result.current).toBe('arrow');
  });
});
