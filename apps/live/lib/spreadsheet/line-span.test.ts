import { describe, expect, it } from 'vitest';
import { lineCount, lineSpan } from './line-span';

describe('lineSpan', () => {
  it('names one line and a span of rows or columns, as Google does', () => {
    expect(lineSpan('r', 2, 2)).toBe('row 3');
    expect(lineSpan('r', 1, 3)).toBe('rows 2 - 4');
    expect(lineSpan('c', 1, 1)).toBe('column B');
    expect(lineSpan('c', 1, 3)).toBe('columns B - D');
  });

  it('counts lines with their noun', () => {
    expect(lineCount('r', 1)).toBe('1 row');
    expect(lineCount('c', 3)).toBe('3 columns');
  });
});
