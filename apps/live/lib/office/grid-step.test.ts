// docs/specs/004-interface-design/office-shell.md "Toolbar", split toggle: arrows move by cell and by row.
import { describe, expect, it } from 'vitest';
import { gridStep } from './grid-step';

describe('gridStep', () => {
  // Five cells, three to a row: 0 1 2 / 3 4.
  it('moves by a cell, wrapping through the rows', () => {
    expect(gridStep(2, 5, 3, 'ArrowRight')).toBe(3);
    expect(gridStep(4, 5, 3, 'ArrowRight')).toBe(0);
    expect(gridStep(0, 5, 3, 'ArrowLeft')).toBe(4);
  });

  it('moves by a row, wrapping to the same column at the other end', () => {
    expect(gridStep(1, 5, 3, 'ArrowDown')).toBe(4);
    expect(gridStep(4, 5, 3, 'ArrowDown')).toBe(1);
    expect(gridStep(2, 5, 3, 'ArrowDown')).toBe(2);
    expect(gridStep(3, 5, 3, 'ArrowUp')).toBe(0);
    expect(gridStep(0, 5, 3, 'ArrowUp')).toBe(3);
    // The last row has no third column: up from it stays in the row above.
    expect(gridStep(2, 5, 3, 'ArrowUp')).toBe(2);
  });
});
