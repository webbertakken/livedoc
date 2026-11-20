// Complex numbers as text (docs/specs/029-sheets/formulas.md "Complex numbers"): what reads as one, how one is
// written, and the powers and roots worked exactly where they can be.
import { describe, expect, it } from 'vitest';
import { complexLn, complexPower, complexSqrt, readComplex, writeComplex } from './complex';

describe('readComplex', () => {
  it.each([
    ['3+4i', { re: 3, im: 4, unit: 'i' }],
    ['3-4j', { re: 3, im: -4, unit: 'j' }],
    ['-i', { re: 0, im: -1, unit: 'i' }],
    ['+j', { re: 0, im: 1, unit: 'j' }],
    ['i', { re: 0, im: 1, unit: 'i' }],
    ['2.5i', { re: 0, im: 2.5, unit: 'i' }],
    ['1e-3+2E2i', { re: 0.001, im: 200, unit: 'i' }],
    ['1e+3-i', { re: 1000, im: -1, unit: 'i' }],
    [' -4.6 ', { re: -4.6, im: 0, unit: 'i' }],
    [7, { re: 7, im: 0, unit: 'i' }],
  ])('reads %j', (v, want) => {
    expect(readComplex(v)).toEqual(want);
  });

  it.each(['', 'x', '3+4k', '3++4i', 'i3', '3+4ii', 'e+i'])('refuses %j with #NUM!', (v) => {
    expect(readComplex(v)).toMatchObject({ e: '#NUM!' });
  });

  it('refuses a boolean with #VALUE! and passes an error on', () => {
    expect(readComplex(true)).toMatchObject({ e: '#VALUE!' });
    expect(readComplex({ e: '#N/A' })).toEqual({ e: '#N/A' });
  });
});

describe('writeComplex', () => {
  it.each([
    [{ re: 2, im: 0 }, '2'],
    [{ re: 0, im: 1 }, 'i'],
    [{ re: 0, im: -1 }, '-i'],
    [{ re: 0, im: 0 }, '0'],
    [{ re: 1, im: -2.5 }, '1-2.5i'],
    [{ re: 64.99999999999999, im: 142.00000000000003 }, '65+142i'],
  ])('writes %j as %s', (c, text) => {
    expect(writeComplex({ ...c, unit: 'i' })).toBe(text);
  });
});

describe('the operations', () => {
  const c = (re: number, im: number) => ({ re, im, unit: 'i' as const });

  it('has no log of 0, nor 0 to a power of 0 or less', () => {
    expect(complexLn(c(0, 0))).toBeNull();
    expect(complexPower(c(0, 0), 0)).toBeNull();
    expect(complexPower(c(0, 0), 2)).toEqual(c(0, 0));
  });

  it('multiplies whole powers out, negative ones inverted', () => {
    expect(complexPower(c(1, 1), 4)).toEqual(c(-4, 0));
    expect(complexPower(c(0, 2), -2)).toEqual(c(-0.25, -0));
    expect(complexPower(c(3, 4), 0)).toEqual(c(1, 0));
  });

  it('works a fractional or very large power in polar form', () => {
    const half = complexPower(c(-4, 0), 0.5)!;
    expect(half.re).toBeCloseTo(0, 12);
    expect(half.im).toBeCloseTo(2, 12);
    expect(complexPower(c(1, 0), 5000)!.re).toBeCloseTo(1, 12);
  });

  it('roots exactly, the sign of the imaginary part kept', () => {
    expect(complexSqrt(c(-4, 0))).toEqual(c(0, 2));
    expect(complexSqrt(c(3, -4))).toEqual(c(2, -1));
  });
});
