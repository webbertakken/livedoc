// A stored reference's shape as the wire carries it, table references included (formulas.md "Table references").
import { describe, expect, it } from 'vitest';
import { isStoredRef } from './stored-ref-shape';

describe('isStoredRef', () => {
  it('takes cell and table references', () => {
    expect(isStoredRef({ r1: 'abcd12', c1: 'abcd34', a: 3 })).toBe(true);
    expect(isStoredRef({ t: 'tbl001' })).toBe(true);
    expect(isStoredRef({ t: 'tbl001', s: 'sheet0xx', tc1: 'abcd12', tc2: 'abcd34', ta: 7 })).toBe(
      true,
    );
  });

  it('refuses a table reference with cell parts, a part past the bits, or a last column alone', () => {
    for (const bad of [
      { t: 'tbl001', r1: 'abcd12' },
      { t: 'tbl001', a: 1 },
      { t: 'tbl001', tc2: 'abcd12' },
      { t: 'tbl001', ta: 0 },
      { t: 'tbl001', ta: 16 },
      { t: 'NO' },
      { r1: 'abcd12', tc1: 'abcd12' },
      { r1: 'abcd12', ta: 2 },
    ])
      expect(isStoredRef(bad), JSON.stringify(bad)).toBe(false);
  });
});
