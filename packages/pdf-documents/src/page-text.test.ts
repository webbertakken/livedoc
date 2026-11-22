import { describe, expect, it } from 'vitest';
import { PageText } from './page-text';

// opening.md "What is read": Text. A reader hands characters over one code point at a time, each with its box; the
// surface reads text, where one character outside the basic plane is two units.
describe('PageText', () => {
  it('holds one box for every unit of its text', () => {
    const page = PageText.of([0x48, 0x69], [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(page.text).toBe('Hi');
    expect(page.boxes).toEqual(new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(page).toMatchObject({ unmapped: [], cut: false });
    expect(PageText.boxAt(page, 1)).toEqual({ left: 5, bottom: 6, right: 7, top: 8 });
    expect(PageText.boxAt(page, 2)).toBeNull();
  });

  it('gives both halves of a character outside the basic plane the same box', () => {
    const page = PageText.of([0x1f3e0, 0x61], [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(page.text).toBe('\u{1F3E0}a');
    expect(page.boxes).toEqual(new Float32Array([1, 2, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('reads a code that is no character as the replacement character, and marks where a font mapped none', () => {
    const page = PageText.of([0x41, 0xd800, 0x110000, 0], new Array<number>(16).fill(0), {
      unmapped: [1, 2],
      cut: true,
    });
    expect(page.text).toBe('A\uFFFD\uFFFD\uFFFD');
    expect(page.unmapped).toEqual([1, 2]);
    expect(page.cut).toBe(true);
  });

  it('points an unmapped character at its place in the text, past wider characters before it', () => {
    const page = PageText.of([0x1f3e0, 0x41], new Array<number>(8).fill(0), { unmapped: [1] });
    expect(page.unmapped).toEqual([2]);
  });
});
