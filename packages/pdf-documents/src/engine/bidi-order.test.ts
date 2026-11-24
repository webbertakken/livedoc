import { describe, expect, it } from 'vitest';
import { typesetterOf } from '../testing/fixtures';
import { inVisualOrder } from './bidi-order';

const latin = (text: string) => ({ face: 'noto-sans-latin-400', text });
const hebrew = (text: string) => ({ face: 'noto-sans-hebrew-hebrew-400', text });

// marks.md "Laying out": a line holding right-to-left and left-to-right words is ordered by UAX 9.
describe('a line in visual order', () => {
  it('keeps a line all at one even level as it is', () => {
    expect(inVisualOrder([latin('abc')], [0, 0, 0])).toEqual([{ ...latin('abc'), level: 0 }]);
    expect(inVisualOrder([], [])).toEqual([]);
  });

  it('cuts a run where the level changes, and reverses the right-to-left stretch', () => {
    // "ab אב cd" from the left: the Hebrew word sits where it was typed.
    expect(
      inVisualOrder(
        [latin('ab '), hebrew('אב'), latin(' '), hebrew('גד'), latin(' cd')],
        [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
      ),
    ).toEqual([
      { ...latin('ab '), level: 0 },
      { ...hebrew('גד'), level: 1 },
      { ...latin(' '), level: 1 },
      { ...hebrew('אב'), level: 1 },
      { ...latin(' cd'), level: 0 },
    ]);
  });

  it('keeps left-to-right words inside a right-to-left line in their own order', () => {
    // "שלום ab cd" from the right: the Latin words read left to right, on the line's left.
    expect(
      inVisualOrder([hebrew('שלום'), latin(' ab cd')], [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]),
    ).toEqual([
      { ...latin('ab cd'), level: 2 },
      { ...latin(' '), level: 1 },
      { ...hebrew('שלום'), level: 1 },
    ]);
  });

  it('never cuts a character past the Basic Multilingual Plane in two', () => {
    const emoji = { face: 'noto-emoji-1-400', text: '🏁' };
    expect(inVisualOrder([emoji], [1, 2])).toEqual([{ ...emoji, level: 1 }]);
  });
});

describe('the levels of a line', () => {
  it('resolves each code unit from the line own direction, a trailing space at the line level', async () => {
    const setter = await typesetterOf([]);
    expect(setter.levels('ab שלום', false)).toEqual([0, 0, 0, 1, 1, 1, 1]);
    expect(setter.levels('שלום ab ', true)).toEqual([1, 1, 1, 1, 1, 2, 2, 1]);
    expect(setter.levels('(שלום)', true)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});
