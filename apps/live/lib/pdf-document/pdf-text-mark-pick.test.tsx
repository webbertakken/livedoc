// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The toolbar": Highlight holds Underline and Strikethrough behind its
// chevron and remembers the last one used, per person, in this browser.
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  isHeldTextMark,
  resetTextMarkPick,
  setTextMarkPick,
  textMarkPick,
  useTextMarkPick,
} from './pdf-text-mark-pick';

afterEach(() => {
  localStorage.clear();
  resetTextMarkPick();
});

describe('the text tool the toolbar holds', () => {
  it('is Highlight until another is taken, and remembers the one taken in this browser', () => {
    expect(textMarkPick()).toBe('highlight');
    setTextMarkPick('strikeout');
    resetTextMarkPick();
    expect(textMarkPick()).toBe('strikeout');
  });

  it('reads Highlight from a stored value that is none of its tools', () => {
    localStorage.setItem('livedoc:v2:pdf-text-mark-tool', 'squiggly');
    expect(textMarkPick()).toBe('highlight');
  });

  it('tells its readers when the pick changes, and only then', () => {
    const { result } = renderHook(() => useTextMarkPick());
    expect(result.current).toBe('highlight');
    act(() => setTextMarkPick('underline'));
    expect(result.current).toBe('underline');
    act(() => setTextMarkPick('underline'));
    expect(result.current).toBe('underline');
  });

  it('holds Highlight, Underline and Strikethrough, and not the squiggly underline', () => {
    expect(['highlight', 'underline', 'strikeout', 'squiggly'].map(isHeldTextMark)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('the text tool the toolbar holds, rendered on the server', () => {
  it('is Highlight, whatever this browser keeps', () => {
    setTextMarkPick('underline');
    function Shown() {
      return <span>{useTextMarkPick()}</span>;
    }
    expect(renderToString(<Shown />)).toBe('<span>highlight</span>');
  });
});
