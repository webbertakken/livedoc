import { describe, expect, it } from 'vitest';
import { checkableWords, isCheckable } from './spelling-words';

const words = (text: string) => checkableWords(text).map((w) => w.word);

describe('checkableWords', () => {
  it('finds each word with its offsets', () => {
    expect(checkableWords('Teh cat, sat.')).toEqual([
      { from: 0, to: 3, word: 'Teh' },
      { from: 4, to: 7, word: 'cat' },
      { from: 9, to: 12, word: 'sat' },
    ]);
  });

  it('keeps apostrophes inside a word and drops a trailing one', () => {
    expect(words("don't the cats' toys")).toEqual(["don't", 'the', 'cats', 'toys']);
    expect(words('it’s')).toEqual(['it’s']);
  });

  it('keeps accented letters and offsets past astral characters', () => {
    expect(checkableWords('😀 café')).toEqual([{ from: 3, to: 7, word: 'café' }]);
  });

  it('skips what is not checked', () => {
    expect(words('abc123 snake_case a@b.c and/or NASA https://x.org www.x.org ok')).toEqual(['ok']);
  });
});

describe('isCheckable', () => {
  it('refuses a word longer than 48 characters', () => {
    expect(isCheckable('a'.repeat(48))).toBe(true);
    expect(isCheckable('a'.repeat(49))).toBe(false);
  });

  it('checks a one-letter capital', () => {
    expect(isCheckable('I')).toBe(true);
  });
});
