// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a tool's look is remembered per kind, per person, in this
// browser; a tool's colour is chosen from the one colour picker, and Reset returns the kind's first look.
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resetTextMarkLooks,
  setTextMarkColour,
  textMarkLooks,
  useTextMarkLooks,
} from './pdf-mark-looks';
import { TEXT_MARK_LOOKS } from './pdf-text-mark';

const KEY = 'livedoc:v2:pdf-mark-looks';

afterEach(() => {
  localStorage.clear();
  resetTextMarkLooks();
});

describe('the text tools’ looks', () => {
  it('are each kind’s first look until a colour is chosen', () => {
    expect(textMarkLooks()).toEqual(TEXT_MARK_LOOKS);
  });

  it('keep a colour chosen for one kind, in this browser, and Reset lets it go', () => {
    setTextMarkColour('underline', '#1D4ED8');
    expect(textMarkLooks().underline).toEqual({ colour: '#1d4ed8', opacity: 1 });
    expect(textMarkLooks().highlight).toEqual(TEXT_MARK_LOOKS.highlight);
    resetTextMarkLooks();
    expect(textMarkLooks().underline.colour).toBe('#1d4ed8');
    setTextMarkColour('underline', null);
    expect(textMarkLooks().underline).toEqual(TEXT_MARK_LOOKS.underline);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({});
  });

  it('takes no colour that is not one', () => {
    setTextMarkColour('highlight', 'red');
    expect(textMarkLooks().highlight).toEqual(TEXT_MARK_LOOKS.highlight);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('passes over what is kept that is no colour of a kind, or no JSON at all', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ squiggly: '#00ff00', ink: '#000000', strikeout: 'url(x)', underline: 3 }),
    );
    expect(textMarkLooks()).toEqual({
      ...TEXT_MARK_LOOKS,
      squiggly: { colour: '#00ff00', opacity: 1 },
    });
    for (const raw of ['not json', 'null', '7']) {
      resetTextMarkLooks();
      localStorage.setItem(KEY, raw);
      expect(textMarkLooks()).toEqual(TEXT_MARK_LOOKS);
    }
  });

  it('tells its readers when a colour changes, and the server draws the first looks', () => {
    const { result } = renderHook(() => useTextMarkLooks());
    expect(result.current).toEqual(TEXT_MARK_LOOKS);
    act(() => setTextMarkColour('strikeout', '#7c3aed'));
    expect(result.current.strikeout.colour).toBe('#7c3aed');
    function Shown() {
      return <span>{useTextMarkLooks().strikeout.colour}</span>;
    }
    expect(renderToString(<Shown />)).toBe(`<span>${TEXT_MARK_LOOKS.strikeout.colour}</span>`);
  });
});
