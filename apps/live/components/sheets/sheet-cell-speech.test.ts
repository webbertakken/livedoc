import { describe, expect, it } from 'vitest';
import { READ_CELLS_MAX, readLine } from './sheet-cell-speech';

// docs/specs/029-sheets/grid-and-editing.md "Accessibility"; surface.md D135.
describe('readLine', () => {
  const value = (r: number, c: number) => (r === 0 ? `Head ${c}` : c === 1 ? '' : `${r}:${c}`);
  const none = () => false;

  it('reads the row from its first column to the active cell, an empty cell as blank', () => {
    expect(readLine({ axis: 'r', active: { r: 4, c: 2 }, skipped: none, value })).toBe(
      'Row 5: A5 4:0, B5 blank, C5 4:2',
    );
  });

  it('reads the column from its first row to the active cell, hidden lines left out', () => {
    const skipped = (r: number) => r === 1;
    expect(readLine({ axis: 'c', active: { r: 2, c: 27 }, skipped, value })).toBe(
      'Column AB: AB1 Head 27, AB3 2:27',
    );
  });

  it('says the first 50 cells, then how many more', () => {
    const said = readLine({ axis: 'c', active: { r: 1_199, c: 0 }, skipped: none, value });
    expect(said.split(', ').length).toBe(READ_CELLS_MAX + 1);
    expect(said.endsWith('A50 49:0, and 1,150 more')).toBe(true);
  });
});
