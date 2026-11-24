// Moving in a choice grid (docs/specs/004-interface-design/office-shell.md "Toolbar", split toggle): Left and Right by a
// cell, wrapping through the rows; Up and Down by a row, wrapping to the same column at the other end. A grid in
// sections (the PDF Stamp control's categories) starts each section on a row of its own; a row with no cell in the
// column is passed over.
export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export const GRID_KEYS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

/** Each row's first cell and how many it holds, the sections' cells `columns` to a row. */
function rowsOf(sections: readonly number[], columns: number): (readonly [number, number])[] {
  const rows: (readonly [number, number])[] = [];
  let start = 0;
  for (const size of sections) {
    for (let at = 0; at < size; at += columns)
      rows.push([start + at, Math.min(columns, size - at)]);
    start += size;
  }
  return rows;
}

/** The cell a key moves to from cell `at` of `count` cells (or of sections of so many), `columns` to a row. */
export function gridStep(
  at: number,
  count: number | readonly number[],
  columns: number,
  key: GridKey,
): number {
  const sections = typeof count === 'number' ? [count] : count;
  const total = sections.reduce((sum, size) => sum + size, 0);
  if (key === 'ArrowLeft') return (at - 1 + total) % total;
  if (key === 'ArrowRight') return (at + 1) % total;
  const rows = rowsOf(sections, columns);
  const row = rows.findIndex(([start, size]) => at >= start && at < start + size);
  const column = at - rows[row]![0];
  const way = key === 'ArrowDown' ? 1 : -1;
  // The next row that holds the column; the row itself, all the way round, holds it at the least.
  for (let step = 1; ; step += 1) {
    const [start, size] = rows[(row + way * step + rows.length * step) % rows.length]!;
    if (column < size) return start + column;
  }
}
