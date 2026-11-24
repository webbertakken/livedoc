import { describe, expect, it } from 'vitest';
import { cellStyleKey, cellStyleOf } from './cell-style';

// standard-mapping.md "Cell styles in the file": the format keys a cell style carries, one key per distinct style.
describe('cellStyleOf', () => {
  it('keeps the keys a file’s cell style carries, never the number format', () => {
    expect(
      cellStyleOf({ nf: 'number', dp: 2, b: true, fc: '#ff0000', fs: 12, ff: 'Lora', ha: 'c' }),
    ).toEqual({ b: true, fc: '#ff0000', fs: 12, ff: 'Lora', ha: 'c' });
    expect(cellStyleOf({ nf: 'percent' })).toBeUndefined();
    expect(cellStyleOf(undefined)).toBeUndefined();
  });

  it('leaves out what a file draws by default: middle (D204), overflow and clip (D205)', () => {
    expect(cellStyleOf({ va: 'm', wr: 'o' })).toBeUndefined();
    expect(cellStyleOf({ wr: 'c', va: 't' })).toEqual({ va: 't' });
    expect(cellStyleOf({ wr: 'w' })).toEqual({ wr: 'w' });
  });
});

describe('cellStyleKey', () => {
  it('is one key per style, whatever order its keys came in', () => {
    expect(cellStyleKey({ b: true, fs: 12 })).toBe(cellStyleKey({ fs: 12, b: true }));
    expect(cellStyleKey({ b: true })).not.toBe(cellStyleKey({ i: true }));
    expect(cellStyleKey(undefined)).toBe('');
    expect(
      cellStyleKey({ bt: { w: 1, s: 'solid', c: '#000000' } }) ===
        cellStyleKey({ bt: { c: '#000000', s: 'solid', w: 1 } }),
    ).toBe(true);
  });
});
