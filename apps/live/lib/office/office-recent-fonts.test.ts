// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "The font menu": the five families chosen last, newest first.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noteRecentFont, readRecentFonts, RECENT_FONTS_KEY } from './office-recent-fonts';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('recent fonts', () => {
  it('keeps the five chosen last, newest first, each once', () => {
    for (const name of ['Lora', 'Roboto', 'Caveat', 'Lobster', 'Oswald', 'Nunito', 'Roboto'])
      noteRecentFont(name);
    expect(readRecentFonts()).toEqual(['Roboto', 'Nunito', 'Oswald', 'Lobster', 'Caveat']);
  });

  it('reads nothing from storage it cannot read', () => {
    localStorage.setItem(RECENT_FONTS_KEY, '{oops');
    expect(readRecentFonts()).toEqual([]);
    localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify({ a: 1 }));
    expect(readRecentFonts()).toEqual([]);
    localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(['Lora', 3]));
    expect(readRecentFonts()).toEqual(['Lora']);
  });

  it('forgets when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    noteRecentFont('Lora');
    expect(readRecentFonts()).toEqual([]);
  });
});
