// @vitest-environment jsdom
// docs/specs/013-workspace/explorer-structure.md "Back": a row's place is read without the cascade's rise, so a place
// kept or taken back mid-cascade is never a few pixels off.
import { describe, expect, it } from 'vitest';
import { layoutTopOf, transformShiftY } from './row-shift';

describe('transformShiftY', () => {
  it('reads the downward move of a 2D or 3D matrix, and none otherwise', () => {
    expect(transformShiftY('none')).toBe(0);
    expect(transformShiftY('matrix(1, 0, 0, 1, 0, 6)')).toBe(6);
    expect(transformShiftY('matrix(1, 0, 0, 1, 3, -2.5)')).toBe(-2.5);
    expect(transformShiftY('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 4, 0, 1)')).toBe(4);
    expect(transformShiftY('rotate(3deg)')).toBe(0);
  });
});

describe('layoutTopOf', () => {
  it('takes a rising row back to where the layout put it', () => {
    const row = document.body.appendChild(document.createElement('li'));
    row.style.transform = 'matrix(1, 0, 0, 1, 0, 6)';
    row.getBoundingClientRect = () => ({ top: 106 }) as DOMRect;
    expect(layoutTopOf(row)).toBe(100);
  });
});
