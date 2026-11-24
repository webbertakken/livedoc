import { describe, expect, it } from 'vitest';
import { isRotation, ROTATION_MAX, ROTATION_MIN, turnedBox, turnedLines } from './rotation';

// formatting.md "Alignment, wrapping, rotation"; sheet.md "Row height".
describe('isRotation', () => {
  it.each([
    [45, true],
    [-90, true],
    [90, true],
    [ROTATION_MIN, true],
    [ROTATION_MAX, true],
    ['v', true],
    [0, false],
    [91, false],
    [-91, false],
    [12.5, false],
    ['x', false],
    [null, false],
  ])('%j is %s', (v, ok) => {
    expect(isRotation(v)).toBe(ok);
  });
});

describe('turnedLines', () => {
  it('stacks one upright character per line, its line breaks dropped', () => {
    expect(turnedLines('ab\nc', 'v', true)).toEqual(['a', 'b', 'c']);
    expect(turnedLines('😀x', 'v', false)).toEqual(['😀', 'x']);
  });
  it('turns typed text by its line breaks, a formula text as one line', () => {
    expect(turnedLines('ab\ncd', 45, true)).toEqual(['ab', 'cd']);
    expect(turnedLines('ab\ncd', 45, false)).toEqual(['ab cd']);
    expect(turnedLines('ab', -90, false)).toEqual(['ab']);
  });
});

describe('turnedBox', () => {
  it('turns a box of its widest line by its lines', () => {
    expect(turnedBox(100, 2, 17, 90)).toEqual({ w: 34, h: 100 });
    expect(turnedBox(100, 1, 17, -90)).toEqual({ w: 17, h: 100 });
    const tilt = turnedBox(100, 1, 17, 45);
    expect(tilt.w).toBeCloseTo(82.73, 2);
    expect(tilt.h).toBeCloseTo(82.73, 2);
  });
  it('stays as it was upright at no angle', () => {
    expect(turnedBox(100, 1, 17, 0)).toEqual({ w: 100, h: 17 });
  });
});
