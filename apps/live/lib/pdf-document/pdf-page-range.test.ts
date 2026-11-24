// docs/specs/035-pdf-documents/files-print-and-sync.md "Printing": Pages takes numbers from 1 and runs "1-3", joined
// by commas, in any order, each page once in the file's order; anything else, or a page past the last, is none.
import { describe, expect, it } from 'vitest';
import { pageRangeProblem, parsePageRange } from './pdf-page-range';

describe('parsePageRange', () => {
  it('reads numbers and runs, in the file’s order, each page once', () => {
    expect(parsePageRange('1-3, 8', 10)).toEqual([0, 1, 2, 7]);
    expect(parsePageRange('8,2 – 3, 2', 10)).toEqual([1, 2, 7]);
    expect(parsePageRange(' 5 ', 5)).toEqual([4]);
    expect(parsePageRange('1,,2', 2)).toEqual([0, 1]);
  });

  it('is none for nothing, words, a run backwards, page 0 or a page past the last', () => {
    for (const text of ['', ' , ', 'odd', '3-1', '0', '1-11', '2.5', '-2', '1-'])
      expect(parsePageRange(text, 10)).toBeNull();
  });

  it('says what a range looks like, up to the last page', () => {
    expect(pageRangeProblem(12)).toBe('Pages like 1-3, 8, from 1 to 12.');
  });
});
