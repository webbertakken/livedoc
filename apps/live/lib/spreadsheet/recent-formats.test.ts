// formatting.md "Number formats" (D194): the Number menu's recently used, from the open sheet's cells.
import { describe, expect, it } from 'vitest';
import type { Cell } from '@livedoc/sheets';
import { RECENT_FORMATS_MAX, recentFormatCodes, recentFormatItemId } from './recent-formats';

const custom = (nc: string): Cell => ({ format: { nf: 'custom', nc } });

describe('recentFormatCodes', () => {
  it('ranks the Custom codes by cells, ties by first seen, at most five', () => {
    const cells: Cell[] = [
      custom('0.0'),
      custom('0.00'),
      custom('0.00'),
      { format: { nf: 'number' } },
      { input: { n: 1 } },
      { format: { nf: 'custom' } },
      custom('a'),
      custom('b'),
      custom('c'),
      custom('d'),
    ];
    expect(recentFormatCodes(cells)).toEqual(['0.00', '0.0', 'a', 'b', 'c']);
    expect(RECENT_FORMATS_MAX).toBe(5);
  });

  it('holds none for a sheet without Custom codes', () => {
    expect(recentFormatCodes([{ format: { nf: 'percent' } }])).toEqual([]);
  });

  it('names each item by its place', () => {
    expect(recentFormatItemId(2)).toBe('number-recent-2');
  });
});
