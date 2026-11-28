// A drag on the grid (useSheetPointer) and what it makes when it ends (docs/specs/029-sheets/sheet.md "Selection",
// "Fill", "Rows and columns", "Freeze"; grid-and-editing.md "Fill and move"): applied once, on the pointer's release.
import { single, type GridRange, type Selection } from '@livedoc/sheets';
import { selectDrawn } from './sheet-drawn-selection';
import { pointingTargetFor } from './sheet-pointing';
import { MOVE_ROWS_IN_SORTED_VIEW } from './useFilterViews';
import { debugLog } from '@/lib/debug-log';
import type { SheetController } from './sheet-controller';
import type { SheetActions } from './useSheetActions';

export type Drag =
  | { kind: 'select'; additive: boolean }
  | { kind: 'fill'; source: GridRange; target: GridRange; copy: boolean }
  | { kind: 'resize'; axis: 'r' | 'c'; index: number; start: number; size: number; px: number }
  // `base`: the ranges held before a Ctrl/⌘ header click, which the picked rows or columns join.
  | { kind: 'axisSelect'; axis: 'r' | 'c'; from: number; base: Selection | null }
  | {
      kind: 'axisMove';
      axis: 'r' | 'c';
      from: number;
      to: number;
      drop: number;
      armed: boolean;
      x0: number;
      y0: number;
    }
  | { kind: 'point'; from: { r: number; c: number }; sheet?: string }
  // A selection moved by its border (D145): `grab` is the pressed cell's offset in it, `press` the cell itself.
  | {
      kind: 'cellMove';
      source: GridRange;
      grab: { r: number; c: number };
      press: { r: number; c: number };
      landing: GridRange;
      armed: boolean;
      x0: number;
      y0: number;
    }
  | { kind: 'freeze'; axis: 'r' | 'c'; count: number };

/** What a drag makes as it ends: `e` holds the keys held at the release (Ctrl or Alt copies). */
export function endDrag(
  d: Drag,
  e: { ctrlKey: boolean; altKey: boolean },
  cc: SheetController,
  actions: SheetActions,
): void {
  // Paint Format: the range just selected takes the held formats (sheet.md "Paint Format").
  if (d.kind === 'select' && cc.rules.paint) {
    const ranges = cc.selectionNow().ranges;
    actions.paintApply(ranges[ranges.length - 1]!);
  }
  // Pointing leaves the caret in the formula being written (this sheet's, or another's).
  if (d.kind === 'point') {
    if (d.sheet) pointingTargetFor(cc.sheet.id, cc.sheet.tabId)?.refocus();
    return;
  }
  if (d.kind === 'fill') {
    const t = d.target;
    if (
      t.r1 !== d.source.r1 ||
      t.r2 !== d.source.r2 ||
      t.c1 !== d.source.c1 ||
      t.c2 !== d.source.c2
    ) {
      // Source and target are in drawn rows (D494); the selection is the stored rows drawn there.
      actions.fill(d.source, t, d.copy || e.ctrlKey || e.altKey);
      const s = d.source;
      // Dragged back inside the source, what is left stays selected; otherwise the source and its fill.
      const inside = t.r1 >= s.r1 && t.r2 <= s.r2 && t.c1 >= s.c1 && t.c2 <= s.c2;
      const grown = inside
        ? t
        : {
            r1: Math.min(t.r1, s.r1),
            c1: Math.min(t.c1, s.c1),
            r2: Math.max(t.r2, s.r2),
            c2: Math.max(t.c2, s.c2),
          };
      cc.setSelection(selectDrawn(cc.geometry, grown, cc.selectionNow().active));
    }
  } else if (d.kind === 'resize') {
    // Only a drag that changed the size sizes the line: a press on an edge alone leaves a row automatic (sheet.md
    // "Row height").
    if (d.px !== d.size) actions.resize(d.axis, linesWith(cc, d.axis, d.index), d.px);
  } else if (d.kind === 'freeze') {
    const now = d.axis === 'c' ? cc.geometry.frozenCols : cc.geometry.frozenRows;
    if (d.count !== now) {
      if (d.axis === 'c') actions.freeze(undefined, d.count);
      else actions.freeze(d.count);
    }
  } else if (d.kind === 'cellMove') {
    // Unmoved, the press was a click on the cell under it; moved, the block lands (Ctrl or ⌥ copies it).
    if (!d.armed) cc.setSelection(single(d.press));
    else if (d.landing.r1 !== d.source.r1 || d.landing.c1 !== d.source.c1)
      actions.moveCells(d.source, d.landing, e.ctrlKey || e.altKey);
  } else if (d.kind === 'axisMove' && d.armed) {
    // A sorted view draws each row where its sort puts it, so a row moved there could not be drawn at the drop (D495).
    if (d.axis === 'r' && cc.geometry.order) {
      debugLog('[sheet] row move refused', { reason: 'sorted view' });
      cc.toast(MOVE_ROWS_IN_SORTED_VIEW);
    } else if (d.drop < d.from || d.drop > d.to + 1) actions.moveAxis(d.axis, d.from, d.to, d.drop);
  }
  cc.focusGrid();
}

// The lines a header's edge acts on: every selected whole line when the line is among them, so several selected
// headers resize, and fit, together (sheet.md "Rows and columns"); else the line alone.
export function linesWith(
  cc: Pick<SheetController, 'selectionNow' | 'grid'>,
  axis: 'r' | 'c',
  index: number,
): number[] {
  const ranges = cc.selectionNow().ranges;
  const sel = ranges[ranges.length - 1]!;
  const whole =
    axis === 'c'
      ? sel.r1 === 0 && sel.r2 >= cc.grid.rows - 1
      : sel.c1 === 0 && sel.c2 >= cc.grid.cols - 1;
  const [a, b] = axis === 'c' ? [sel.c1, sel.c2] : [sel.r1, sel.r2];
  return whole && index >= a && index <= b ? range(a, b) : [index];
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}
