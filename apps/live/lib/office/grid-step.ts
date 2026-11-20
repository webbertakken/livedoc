// Moving in a choice grid (docs/specs/004-interface-design/office-shell.md "Toolbar", split toggle): Left and Right by a
// cell, wrapping through the rows; Up and Down by a row, wrapping to the same column at the other end.
export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export const GRID_KEYS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** The cell a key moves to from cell `at` of `count` cells, `columns` to a row. */
export function gridStep(at: number, count: number, columns: number, key: GridKey): number {
  switch (key) {
    case 'ArrowLeft':
      return (at - 1 + count) % count;
    case 'ArrowRight':
      return (at + 1) % count;
    case 'ArrowDown':
      return at + columns < count ? at + columns : at % columns;
    case 'ArrowUp': {
      if (at - columns >= 0) return at - columns;
      const last = Math.floor((count - 1) / columns) * columns + (at % columns);
      return last < count ? last : last - columns;
    }
  }
}
