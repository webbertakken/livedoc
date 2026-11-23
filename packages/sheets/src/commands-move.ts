// Moving cells by their border (docs/specs/029-sheets/grid-and-editing.md "Fill and move"; D145, D146): the block
// lands at a drop kept inside the grid, as a cut and paste (every formula reading it follows) or, with copy, as a
// copy and paste (formulas shift). Merges wholly inside the block go with it, those wholly under the landing go, and
// a move that would split any other is refused.
import type { GridRange } from './address';
import { clipFromRange } from './clipboard';
import { pasteClip, pasteCut, type PasteResult } from './commands-paste';
import type { Rand } from './ids';
import { idRangeOf, posRangeOf } from './layout';
import { MERGE_CELLS_MOVE_REFUSAL, type MergeRefusal } from './merge-guards';
import type { IdRange, SheetLayout } from './sheet';
import type { SheetWrite } from './store';
import type { Workbook } from './engine/workbook';

/** Where a block lands with its top left at `at`: moved back as little as keeps it inside a rows × cols grid. */
export function landingOf(
  source: GridRange,
  at: { r: number; c: number },
  rows: number,
  cols: number,
): GridRange {
  const h = source.r2 - source.r1;
  const w = source.c2 - source.c1;
  const r1 = Math.max(0, Math.min(at.r, rows - 1 - h));
  const c1 = Math.max(0, Math.min(at.c, cols - 1 - w));
  return { r1, c1, r2: r1 + h, c2: c1 + w };
}

const overlaps = (a: GridRange, b: GridRange) =>
  a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2;
const inside = (a: GridRange, b: GridRange) =>
  a.r1 >= b.r1 && a.r2 <= b.r2 && a.c1 >= b.c1 && a.c2 <= b.c2;
const crosses = (a: GridRange, b: GridRange) => overlaps(a, b) && !inside(a, b);

// The sheet's merges after the move (D146), null when it changes none, or the refusal.
function mergesAfter(
  layout: SheetLayout,
  source: GridRange,
  landing: GridRange,
  copy: boolean,
): IdRange[] | MergeRefusal | null {
  const dr = landing.r1 - source.r1;
  const dc = landing.c1 - source.c1;
  const kept: IdRange[] = [];
  const added: IdRange[] = [];
  let changed = false;
  for (const m of layout.merges ?? []) {
    const b = posRangeOf(layout, m);
    if (!b) {
      kept.push(m);
      continue;
    }
    if (crosses(b, source)) return { refused: MERGE_CELLS_MOVE_REFUSAL };
    const carried = inside(b, source);
    // A moved merge leaves its old place, so only what stays put can be split or covered by the landing.
    const stays = copy || !carried;
    if (stays && crosses(b, landing)) return { refused: MERGE_CELLS_MOVE_REFUSAL };
    if (carried) {
      added.push(idRangeOf(layout, b.r1 + dr, b.c1 + dc, b.r2 + dr, b.c2 + dc)!);
      changed = true;
    }
    if (stays && inside(b, landing)) changed = true;
    else if (stays) kept.push(m);
  }
  return changed ? [...kept, ...added] : null;
}

/** The writes that move (or copy) `source` to the block at `at`, or a refusal; null when nothing would change. */
export function moveCells(
  wb: Workbook,
  sheetId: string,
  source: GridRange,
  at: { r: number; c: number },
  copy: boolean,
  rand: Rand = Math.random,
): PasteResult | MergeRefusal | null {
  const sheet = wb.sheet(sheetId);
  if (!sheet) return null;
  const { layout } = sheet;
  const landing = landingOf(source, at, layout.rows.length, layout.cols.length);
  if (landing.r1 === source.r1 && landing.c1 === source.c1) return null;
  const merges = mergesAfter(layout, source, landing, copy);
  if (merges && 'refused' in merges) return merges;
  const clip = clipFromRange(wb, sheetId, source, !copy)!;
  const moved = copy
    ? pasteClip(wb, sheetId, landing, clip, 'all', rand)!
    : pasteCut(wb, sheetId, { r: landing.r1, c: landing.c1 }, clip, rand)!;
  if (!merges) return moved;
  // The landing is inside the grid, so the sheet's own write is a plain cells write: the merges join it.
  const edits = moved.edits.map((e) => {
    if (e.sheetId !== sheetId) return e;
    const { cells } = e.write as Extract<SheetWrite, { kind: 'cells' }>;
    const write: SheetWrite = { kind: 'layout', changes: [{ k: 'merges', merges }], cells };
    return { ...e, write };
  });
  return { ...moved, edits };
}
