// A menu's size grid (docs/specs/004-interface-design/office-shell.md "Menus as data"): Insert > Table's grid of cells,
// sized by pointing or by the arrows, read as columns x rows. Pure.

/** A size the grid gives: how many columns and rows. */
export type GridSize = { readonly columns: number; readonly rows: number };

/** The cells a size grid shows each way before it grows (default). */
export const SIZE_GRID_START = 5;

/** The cells shown for the size pointed at: one past it each way, at least the start, at most `most`. */
export function shownGrid(size: GridSize, most: GridSize): GridSize {
  const shown = (n: number, top: number) => Math.min(top, Math.max(SIZE_GRID_START, n + 1));
  return { columns: shown(size.columns, most.columns), rows: shown(size.rows, most.rows) };
}

/** The size an arrow key makes of `size`; null where it cannot change it, so the menu's own key runs. */
export function stepGrid(size: GridSize, key: string, most: GridSize): GridSize | null {
  const step = {
    ArrowRight: { columns: 1, rows: 0 },
    ArrowLeft: { columns: -1, rows: 0 },
    ArrowDown: { columns: 0, rows: 1 },
    ArrowUp: { columns: 0, rows: -1 },
  }[key];
  if (!step) return null;
  const columns = size.columns + step.columns;
  const rows = size.rows + step.rows;
  if (columns < 1 || rows < 1 || columns > most.columns || rows > most.rows) return null;
  return { columns, rows };
}

/** The size as the grid shows it: columns x rows. */
export const gridSizeLabel = (size: GridSize): string => `${size.columns} x ${size.rows}`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The grid's accessible name at a size: what it inserts, in words. */
export const gridSizeName = (label: string, size: GridSize): string =>
  `${label}, ${plural(size.columns, 'column')} by ${plural(size.rows, 'row')}`;
