import { describe, expect, it } from 'vitest';
import { canonical } from './canonical';

describe('canonical', () => {
  it('reads the same whatever order keys were set in, at every depth', () => {
    expect(canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      canonical({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }),
    );
    expect(canonical({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it('keeps a list in its order, and tells a value from its absence', () => {
    expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
    expect(canonical(undefined)).toBeUndefined();
    expect(canonical(null)).toBe('null');
  });
});
