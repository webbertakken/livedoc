// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a tool's look is remembered per kind, per person, in this
// browser; a tool's colour is chosen from the one colour picker, and Reset returns the kind's first look.
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resetMarkLooks,
  setMarkColour,
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

  it('passes over what is kept that is no colour of a kind, or no JSON at all', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ squiggly: '#00ff00', ink: '#000000', strikeout: 'url(x)', underline: 3 }),
    );
    expect(markLooks()).toEqual({
      ...FIRST_LOOKS,
      squiggly: { colour: '#00ff00', opacity: 1 },
    });
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
