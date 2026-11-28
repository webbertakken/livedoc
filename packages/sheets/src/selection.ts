// The selection (docs/specs/029-sheets/sheet.md "Selection", "Keyboard"): ranges of positions with an active cell
// and an anchor (where Shift extends from). Moves skip hidden rows and columns and treat a merge as one cell. Under a
// drawn order (data-tools.md "The drawn order", D493) moves go to the row drawn next, and a range picked holds the rows
// drawn between its corners, as runs side by side both in the sheet and on screen.
import { normaliseRange, rangeContains, type CellPos, type GridRange } from './address';
import { DrawnOrder } from './drawn-order';

// `tail`: how many of the last ranges are the one range being picked, cut into runs by a drawn order (1 when absent).
export type Selection = { ranges: GridRange[]; active: CellPos; anchor: CellPos; tail?: number };

export type Grid = {
  rows: number;
  cols: number;
  hiddenRow(r: number): boolean;
  hiddenCol(c: number): boolean;
  filled(r: number, c: number): boolean;
  // The merge covering a cell, as positions, if any.
  mergeAt(r: number, c: number): GridRange | null;
  // The order rows are drawn in, when a view draws its own; positions stay the sheet's.
  order?: DrawnOrder | null;
};

export type Dir = 'up' | 'down' | 'left' | 'right';

const STEP: Record<Dir, [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

export function single(pos: CellPos): Selection {
  return { ranges: [normaliseRange(pos, pos)], active: pos, anchor: pos };
}

// Grow a range until it holds every merge it touches.
export function expandForMerges(range: GridRange, grid: Grid): GridRange {
  let r = { ...range };
  for (let pass = 0; pass < 8; pass++) {
    let grown = false;
    for (let i = r.r1; i <= r.r2; i++)
      for (const j of [r.c1, r.c2]) grown = growBy(r, grid.mergeAt(i, j)) || grown;
    for (let j = r.c1; j <= r.c2; j++)
      for (const i of [r.r1, r.r2]) grown = growBy(r, grid.mergeAt(i, j)) || grown;
    if (!grown) break;
    r = { ...r };
  }
  return r;
}

function growBy(r: GridRange, m: GridRange | null): boolean {
  if (!m) return false;
  const before = `${r.r1},${r.c1},${r.r2},${r.c2}`;
  r.r1 = Math.min(r.r1, m.r1);
  r.c1 = Math.min(r.c1, m.c1);
  r.r2 = Math.max(r.r2, m.r2);
  r.c2 = Math.max(r.c2, m.c2);
  return before !== `${r.r1},${r.c1},${r.r2},${r.c2}`;
}

function clamp(pos: CellPos, grid: Grid): CellPos {
  return {
    r: Math.max(0, Math.min(grid.rows - 1, pos.r)),
    c: Math.max(0, Math.min(grid.cols - 1, pos.c)),
  };
}

// One step in a direction, past hidden rows and columns and out of a merge.
export function stepFrom(pos: CellPos, dir: Dir, grid: Grid): CellPos {
  const [dr, dc] = STEP[dir];
  const m = grid.mergeAt(pos.r, pos.c);
  let r = pos.r;
  let c = pos.c;
  if (m) {
    if (dr > 0) r = m.r2;
    if (dr < 0) r = m.r1;
    if (dc > 0) c = m.c2;
    if (dc < 0) c = m.c1;
  }
  const order = grid.order;
  for (;;) {
    const nr = dr !== 0 && order ? DrawnOrder.step(order, r, dr) : r + dr;
    const nc = c + dc;
    if (nr < 0 || nc < 0 || nr >= grid.rows || nc >= grid.cols || (dr !== 0 && nr === r))
      return pos;
    r = nr;
    c = nc;
    if ((dr !== 0 && grid.hiddenRow(r)) || (dc !== 0 && grid.hiddenCol(c))) continue;
    const target = grid.mergeAt(r, c);
    return target ? { r: target.r1, c: target.c1 } : { r, c };
  }
}

// Ctrl + arrow: to the edge of the filled run, or to the next filled cell, or to the sheet's edge.
export function jumpFrom(pos: CellPos, dir: Dir, grid: Grid): CellPos {
  let cur = pos;
  let next = stepFrom(cur, dir, grid);
  if (next.r === cur.r && next.c === cur.c) return cur;
  if (grid.filled(cur.r, cur.c) && grid.filled(next.r, next.c)) {
    for (;;) {
      const after = stepFrom(next, dir, grid);
      if ((after.r === next.r && after.c === next.c) || !grid.filled(after.r, after.c)) return next;
      next = after;
    }
  }
  cur = next;
  for (;;) {
    if (grid.filled(cur.r, cur.c)) return cur;
    const after = stepFrom(cur, dir, grid);
    if (after.r === cur.r && after.c === cur.c) return cur;
    cur = after;
  }
}

export function moveSelection(sel: Selection, dir: Dir, grid: Grid, jump = false): Selection {
  const to = jump ? jumpFrom(sel.active, dir, grid) : stepFrom(sel.active, dir, grid);
  return single(to);
}

// The ranges of the one being picked: the last, or its runs under a drawn order.
function tailOf(sel: Selection): GridRange[] {
  return sel.ranges.slice(sel.ranges.length - (sel.tail ?? 1));
}

// The corner of the last range across from its anchor: where Shift and a move go on from. Under a drawn order, the
// drawn row farthest from the anchor's among the runs being picked.
export function farCorner(sel: Selection, grid?: Grid): CellPos {
  const order = grid?.order;
  const range = sel.ranges[sel.ranges.length - 1]!;
  if (order) {
    const tail = tailOf(sel);
    const drawn = tail.flatMap((t) => [order.drawnOf[t.r1]!, order.drawnOf[t.r2]!]);
    const lo = Math.min(...drawn);
    const hi = Math.max(...drawn);
    const far = order.drawnOf[sel.anchor.r] === lo ? hi : lo;
    return { r: order.storedAt[far]!, c: sel.anchor.c === range.c1 ? range.c2 : range.c1 };
  }
  return {
    r: sel.anchor.r === range.r1 ? range.r2 : range.r1,
    c: sel.anchor.c === range.c1 ? range.c2 : range.c1,
  };
}

// Shift + arrow: the far corner from the anchor moves; the active cell stays.
export function extendSelection(sel: Selection, dir: Dir, grid: Grid, jump = false): Selection {
  const far = farCorner(sel, grid);
  const to = jump ? jumpFrom(far, dir, grid) : stepFrom(far, dir, grid);
  return extendTo(sel, to, grid);
}

// A move to a cell: the cell alone, or with Shift the selection grown from its anchor to it.
export function goTo(sel: Selection, to: CellPos, grid: Grid, extend: boolean): Selection {
  return extend ? extendTo(sel, to, grid) : single(clamp(to, grid));
}

export function extendTo(sel: Selection, to: CellPos, grid: Grid): Selection {
  const end = clamp(to, grid);
  const base = sel.ranges.slice(0, sel.ranges.length - (sel.tail ?? 1));
  const order = grid.order;
  if (order) {
    const cols = { c1: Math.min(sel.anchor.c, end.c), c2: Math.max(sel.anchor.c, end.c) };
    const runs = DrawnOrder.runs(order, order.drawnOf[sel.anchor.r]!, order.drawnOf[end.r]!).map(
      (run) => expandForMerges({ ...run, ...cols }, grid),
    );
    const { tail: _tail, ...rest } = sel;
    return {
      ...rest,
      ranges: [...base, ...runs],
      ...(runs.length > 1 ? { tail: runs.length } : {}),
    };
  }
  const range = expandForMerges(normaliseRange(sel.anchor, end), grid);
  const { tail: _tail, ...rest } = sel;
  return { ...rest, ranges: [...base, range] };
}

// Ctrl/⌘ and a header click or drag: the rows or columns picked join the ranges held before.
export function addSelection(base: Selection, next: Selection): Selection {
  return { ranges: [...base.ranges, ...next.ranges], active: next.active, anchor: next.anchor };
}

// Ctrl/⌘ + click: another range, its own active cell.
export function addRange(sel: Selection, pos: CellPos, grid: Grid): Selection {
  const m = grid.mergeAt(pos.r, pos.c);
  const range = m ?? normaliseRange(pos, pos);
  return { ranges: [...sel.ranges, range], active: pos, anchor: pos };
}

// Rows r1 to r2 whole; under a drawn order the rows drawn between them, as runs (D493), the active cell the top one drawn.
export function selectRows(r1: number, r2: number, grid: Grid): Selection {
  const order = grid.order;
  if (order) {
    const runs = DrawnOrder.runs(order, order.drawnOf[r1]!, order.drawnOf[r2]!);
    const top = order.storedAt[Math.min(order.drawnOf[r1]!, order.drawnOf[r2]!)]!;
    return {
      ranges: runs.map((run) => ({ ...run, c1: 0, c2: grid.cols - 1 })),
      active: { r: top, c: 0 },
      anchor: { r: r1, c: 0 },
      ...(runs.length > 1 ? { tail: runs.length } : {}),
    };
  }
  const range = { r1: Math.min(r1, r2), c1: 0, r2: Math.max(r1, r2), c2: grid.cols - 1 };
  return { ranges: [range], active: { r: range.r1, c: 0 }, anchor: { r: r1, c: 0 } };
}

export function selectCols(c1: number, c2: number, grid: Grid): Selection {
  const range = { r1: 0, c1: Math.min(c1, c2), r2: grid.rows - 1, c2: Math.max(c1, c2) };
  return { ranges: [range], active: { r: 0, c: range.c1 }, anchor: { r: 0, c: c1 } };
}

export function selectAllCells(grid: Grid): Selection {
  return {
    ranges: [{ r1: 0, c1: 0, r2: grid.rows - 1, c2: grid.cols - 1 }],
    active: { r: 0, c: 0 },
    anchor: { r: 0, c: 0 },
  };
}

// The filled block around a cell (Ctrl+A's first press): grown while any edge's neighbour line holds something.
export function currentRegion(pos: CellPos, grid: Grid): GridRange {
  const r: GridRange = { r1: pos.r, c1: pos.c, r2: pos.r, c2: pos.c };
  const lineFilled = (fixed: number, from: number, to: number, isRow: boolean) => {
    for (let k = Math.max(0, from); k <= Math.min(to, (isRow ? grid.cols : grid.rows) - 1); k++)
      if (isRow ? grid.filled(fixed, k) : grid.filled(k, fixed)) return true;
    return false;
  };
  for (let guard = 0; guard < 100_000; guard++) {
    let grown = false;
    if (r.r1 > 0 && lineFilled(r.r1 - 1, r.c1 - 1, r.c2 + 1, true)) {
      r.r1--;
      grown = true;
    }
    if (r.r2 < grid.rows - 1 && lineFilled(r.r2 + 1, r.c1 - 1, r.c2 + 1, true)) {
      r.r2++;
      grown = true;
    }
    if (r.c1 > 0 && lineFilled(r.c1 - 1, r.r1, r.r2, false)) {
      r.c1--;
      grown = true;
    }
    if (r.c2 < grid.cols - 1 && lineFilled(r.c2 + 1, r.r1, r.r2, false)) {
      r.c2++;
      grown = true;
    }
    if (!grown) break;
  }
  return r;
}

// Ctrl+A: the region around the active cell, then (pressed again, or on an empty cell) the whole sheet.
export function selectAll(sel: Selection, grid: Grid): Selection {
  const region = currentRegion(sel.active, grid);
  const current = sel.ranges[sel.ranges.length - 1]!;
  const alone =
    region.r1 === region.r2 && region.c1 === region.c2 && !grid.filled(region.r1, region.c1);
  const same =
    current.r1 === region.r1 &&
    current.c1 === region.c1 &&
    current.r2 === region.r2 &&
    current.c2 === region.c2;
  if (alone || same) return { ...selectAllCells(grid), active: sel.active };
  return { ranges: [region], active: sel.active, anchor: { r: region.r1, c: region.c1 } };
}

// Page Up / Page Down a screen of rows away, Alt + Page Up / Page Down a screen of columns: where the move lands.
export function pageTarget(
  from: CellPos,
  step: { rows: number; cols: number },
  grid: Grid,
): CellPos {
  let pos = from;
  const rowDir: Dir = step.rows < 0 ? 'up' : 'down';
  const colDir: Dir = step.cols < 0 ? 'left' : 'right';
  for (let i = 0; i < Math.abs(step.rows); i++) pos = stepFrom(pos, rowDir, grid);
  for (let i = 0; i < Math.abs(step.cols); i++) pos = stepFrom(pos, colDir, grid);
  return pos;
}

// Home / End the row's first and last column; Ctrl+Home / Ctrl+End A1 and the last filled cell.
export function homeEndTarget(
  from: CellPos,
  which: 'home' | 'end',
  toSheet: boolean,
  grid: Grid,
  lastFilled: CellPos,
): CellPos {
  if (toSheet) return which === 'home' ? { r: 0, c: 0 } : lastFilled;
  return { r: from.r, c: which === 'home' ? 0 : Math.max(0, grid.cols - 1) };
}

export function inSelection(sel: Selection, r: number, c: number): boolean {
  return sel.ranges.some((range) => rangeContains(range, r, c));
}

// Does the selection hold more than one cell? A merge is one cell, so a clicked merge (its range the merge's) is a
// single cell: Enter edits it and Tab moves on, rather than walking into the cells it covers.
export function selectsSeveral(sel: Selection, grid: Grid): boolean {
  const range = primaryRange(sel);
  const { r, c } = sel.active;
  const one = grid.mergeAt(r, c) ?? { r1: r, c1: c, r2: r, c2: c };
  return range.r1 < one.r1 || range.c1 < one.c1 || range.r2 > one.r2 || range.c2 > one.c2;
}

// Whole lines the selection's range holds (grid-and-editing.md "Rows, columns and cells"): rows when it spans every
// column (the whole sheet included), columns when it spans every row, else none: cells.
export function wholeLines(sel: Selection, grid: Grid): 'r' | 'c' | null {
  const range = primaryRange(sel);
  if (range.c1 === 0 && range.c2 >= grid.cols - 1) return 'r';
  if (range.r1 === 0 && range.r2 >= grid.rows - 1) return 'c';
  return null;
}

// The range Enter and Tab move within, when more than one cell is selected.
function primaryRange(sel: Selection): GridRange {
  return sel.ranges[sel.ranges.length - 1]!;
}

// Enter / Tab inside a selection of more than one cell: the active cell walks the range and wraps.
export function cycleInRange(
  sel: Selection,
  dir: 'next-row' | 'prev-row' | 'next-col' | 'prev-col',
): Selection {
  const range = primaryRange(sel);
  let { r, c } = sel.active;
  const width = range.c2 - range.c1 + 1;
  const height = range.r2 - range.r1 + 1;
  if (dir === 'next-row' || dir === 'prev-row') {
    const step = dir === 'next-row' ? 1 : -1;
    r += step;
    if (r > range.r2) {
      r = range.r1;
      c = range.c1 + ((c - range.c1 + 1) % width);
    }
    if (r < range.r1) {
      r = range.r2;
      c = range.c1 + ((c - range.c1 - 1 + width) % width);
    }
  } else {
    const step = dir === 'next-col' ? 1 : -1;
    c += step;
    if (c > range.c2) {
      c = range.c1;
      r = range.r1 + ((r - range.r1 + 1) % height);
    }
    if (c < range.c1) {
      c = range.c2;
      r = range.r1 + ((r - range.r1 - 1 + height) % height);
    }
  }
  return { ...sel, active: { r, c } };
}
