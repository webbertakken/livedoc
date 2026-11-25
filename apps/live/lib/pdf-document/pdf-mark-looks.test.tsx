// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a tool's look is remembered per kind, per person, in this
// browser; a tool's colour is chosen from the one colour picker, and Reset returns the kind's first look.
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resetMarkLooks,
  setMarkColour,
  setMarkLine,
  markLooks,
  FIRST_LOOKS,
  useMarkLooks,
} from './pdf-mark-looks';

const KEY = 'livedoc:v2:pdf-mark-looks';

afterEach(() => {
  localStorage.clear();
  resetMarkLooks();
});

describe('the text tools’ looks', () => {
  it('are each kind’s first look until a colour is chosen', () => {
    expect(markLooks()).toEqual(FIRST_LOOKS);
  });

  it('keep a colour chosen for one kind, in this browser, and Reset lets it go', () => {
    setMarkColour('underline', '#1D4ED8');
    expect(markLooks().underline).toEqual({ colour: '#1d4ed8', opacity: 1 });
    expect(markLooks().highlight).toEqual(FIRST_LOOKS.highlight);
    resetMarkLooks();
    expect(markLooks().underline.colour).toBe('#1d4ed8');
    setMarkColour('underline', null);
    expect(markLooks().underline).toEqual(FIRST_LOOKS.underline);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({});
  });

  it('takes no colour that is not one', () => {
    setMarkColour('highlight', 'red');
    expect(markLooks().highlight).toEqual(FIRST_LOOKS.highlight);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  // marks.md "Stamps": a stamp's colour is its own, never a kept look.
  it('passes over what is kept that is no colour of a kind with a look, or no JSON at all', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        squiggly: '#00ff00',
        ink: '#000000',
        stamp: '#000000',
        strikeout: 'url(x)',
        underline: 3,
      }),
    );
    expect(markLooks()).toEqual({
      ...FIRST_LOOKS,
      squiggly: { colour: '#00ff00', opacity: 1 },
    });
    expect(markLooks()).not.toHaveProperty('stamp');
    for (const raw of ['not json', 'null', '7']) {
      resetMarkLooks();
      localStorage.setItem(KEY, raw);
      expect(markLooks()).toEqual(FIRST_LOOKS);
    }
  });

  it('tells its readers when a colour changes, and the server draws the first looks', () => {
    const { result } = renderHook(() => useMarkLooks());
    expect(result.current).toEqual(FIRST_LOOKS);
    act(() => setMarkColour('strikeout', '#7c3aed'));
    expect(result.current.strikeout.colour).toBe('#7c3aed');
    function Shown() {
      return <span>{useMarkLooks().strikeout.colour}</span>;
    }
    expect(renderToString(<Shown />)).toBe(`<span>${FIRST_LOOKS.strikeout.colour}</span>`);
  });
});

// marks.md "Making a mark": A tool's line, kept for the kind as its colour is.
describe('a tool’s line', () => {
  const LINES = 'livedoc:v2:pdf-mark-lines';

  it('starts at the kind’s first width, solid and unfilled', () => {
    expect(markLooks().rectangle).toEqual({ ...FIRST_LOOKS.rectangle, width: 2 });
    expect(markLooks().drawing.width).toBe(2);
    expect(markLooks().highlight).not.toHaveProperty('width');
  });

  it('keeps a width, a line style and a fill chosen for one kind, in this browser', () => {
    expect(setMarkLine('rectangle', { width: 8 })).toBe(true);
    expect(setMarkLine('rectangle', { lineStyle: 'dotted' })).toBe(true);
    expect(setMarkLine('rectangle', { fill: '#FDE68A' })).toBe(true);
    expect(markLooks().rectangle).toEqual({
      ...FIRST_LOOKS.rectangle,
      width: 8,
      lineStyle: 'dotted',
      fill: '#fde68a',
    });
    expect(markLooks().ellipse).toEqual(FIRST_LOOKS.ellipse);
    resetMarkLooks();
    expect(markLooks().rectangle.fill).toBe('#fde68a');
  });

  it('holds Solid and no fill as nothing kept, and lets the kind go once nothing is', () => {
    setMarkLine('ellipse', { lineStyle: 'dashed' });
    setMarkLine('ellipse', { fill: '#000000' });
    setMarkLine('ellipse', { lineStyle: 'solid' });
    setMarkLine('ellipse', { fill: null });
    expect(markLooks().ellipse).toEqual(FIRST_LOOKS.ellipse);
    expect(JSON.parse(localStorage.getItem(LINES)!)).toEqual({});
  });

  it('takes no width outside a mark’s range, no style that is none, and no fill for a kind without an inside', () => {
    expect(setMarkLine('line', { width: 0.25 })).toBe(false);
    expect(setMarkLine('line', { width: 13 })).toBe(false);
    expect(setMarkLine('line', { lineStyle: 'wavy' as never })).toBe(false);
    expect(setMarkLine('line', { fill: '#ff0000' })).toBe(false);
    expect(setMarkLine('rectangle', { fill: 'red' })).toBe(false);
    expect(markLooks().line).toEqual(FIRST_LOOKS.line);
    expect(localStorage.getItem(LINES)).toBeNull();
  });

  it('passes over each part kept that is not one, and any kind with no line', () => {
    localStorage.setItem(
      LINES,
      JSON.stringify({
        arrow: { width: 4, lineStyle: 'solid', fill: '#ff0000' },
        rectangle: { width: 99, lineStyle: 'long-dashes', fill: '#00ff00' },
        highlight: { width: 4 },
        ellipse: 'wide',
      }),
    );
    setMarkColour('arrow', '#123456');
    expect(markLooks().arrow).toEqual({ ...FIRST_LOOKS.arrow, colour: '#123456', width: 4 });
    expect(markLooks().rectangle).toEqual({
      ...FIRST_LOOKS.rectangle,
      lineStyle: 'long-dashes',
      fill: '#00ff00',
    });
    expect(markLooks().highlight).toEqual(FIRST_LOOKS.highlight);
    expect(markLooks().ellipse).toEqual(FIRST_LOOKS.ellipse);
    resetMarkLooks();
    localStorage.setItem(LINES, 'not json');
    expect(markLooks().line).toEqual(FIRST_LOOKS.line);
  });

  it('tells its readers when a line changes', () => {
    const { result } = renderHook(() => useMarkLooks());
    act(() => void setMarkLine('drawing', { width: 12 }));
    expect(result.current.drawing.width).toBe(12);
  });
});
