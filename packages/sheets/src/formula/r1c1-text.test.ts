// Formulas on the clipboard as R1C1 (grid-and-editing.md "Clipboard", D152).
import { describe, expect, it } from 'vitest';
import { a1ToR1C1, r1c1ToA1 } from './r1c1-text';

describe('a1ToR1C1', () => {
  it('writes references relative to the cell, absolute parts by number', () => {
    expect(a1ToR1C1('=A1*2', { r: 0, c: 1 })).toBe('=R[0]C[-1]*2');
    expect(a1ToR1C1('=SUM($B$2:B3)+Sheet2!C$4', { r: 3, c: 3 })).toBe(
      '=SUM(R2C2:R[-1]C[-2])+Sheet2!R4C[-1]',
    );
  });

  it('leaves strings, quoted sheet names, functions and whole columns alone', () => {
    expect(a1ToR1C1(`=CONCAT("A1",'Q 1'!B2,LOG10(A2),A:A)`, { r: 0, c: 0 })).toBe(
      `=CONCAT("A1",'Q 1'!R[1]C[1],LOG10(R[1]C[0]),A:A)`,
    );
    expect(a1ToR1C1(`="say ""B2"""&B2`, { r: 0, c: 0 })).toBe(`="say ""B2"""&R[1]C[1]`);
    expect(a1ToR1C1(`='it''s'!B2`, { r: 1, c: 1 })).toBe(`='it''s'!R[0]C[0]`);
  });
});

describe('r1c1ToA1', () => {
  it('reads references from the cell they land in', () => {
    expect(r1c1ToA1('=R[0]C[-1]*2', { r: 4, c: 2 })).toBe('=B5*2');
    expect(r1c1ToA1('=SUM(R2C2:R[-1]C[-2])+RC', { r: 3, c: 3 })).toBe('=SUM($B$2:B3)+D4');
    expect(r1c1ToA1(`="R1C1"&'R 1'!r1c[1]`, { r: 0, c: 0 })).toBe(`="R1C1"&'R 1'!B$1`);
  });

  it('gives null when a reference falls off the top or the left', () => {
    expect(r1c1ToA1('=R[-1]C[0]', { r: 0, c: 0 })).toBeNull();
    expect(r1c1ToA1('=R[0]C[-3]', { r: 0, c: 1 })).toBeNull();
  });
});
