// What groups do (docs/specs/029-sheets/grid-and-editing.md "Groups and the outline"): Group and Ungroup, an
// Editor's writes; Collapse and Expand, an Editor's for everyone and anyone else's for themselves (D163). Built from
// the engine's outline commands and spread into useSheetActions, so a key, a menu row and a control never differ.
import {
  collapseAll,
  collapseGroup,
  collapseGroups,
  foldTargets,
  groupLines,
  setControls,
  ungroupLines,
  wholeLines,
  type FoldChange,
  type LineGroup,
  type OutlineAxis,
  type SheetWrite,
} from '@livedoc/sheets';
import type { SheetController } from './sheet-controller';

export function sheetOutlineActions(c: SheetController) {
  // The selection's lines on that axis.
  const span = (axis: OutlineAxis): [number, number] => {
    const ranges = c.selectionNow().ranges;
    const g = ranges[ranges.length - 1]!;
    return axis === 'r' ? [g.r1, g.r2] : [g.c1, g.c2];
  };
  // The sheet as this person sees it: their own folds over it.
  const seen = () => ({ ...c.sheet, layout: c.viewLayout });
  const foldBy = (w: SheetWrite | null) => {
    if (w?.kind !== 'layout') return;
    if (c.canShape) c.write(w, 'Group');
    else c.foldForSelf(w.changes as FoldChange[]);
  };
  const fold = (axis: OutlineAxis, group: LineGroup, collapsed: boolean) =>
    foldBy(collapseGroup(seen(), axis, group, collapsed));
  return {
    // A line past 7 deep refuses the whole group, said in a toast (D159).
    group(axis: OutlineAxis) {
      const w = groupLines(c.sheet, axis, ...span(axis));
      if (w && 'refused' in w) c.toast(w.refused);
      else if (w) c.write(w, 'Group');
    },
    ungroup(axis: OutlineAxis) {
      const w = ungroupLines(c.sheet, axis, ...span(axis));
      if (w) c.write(w, 'Group');
    },
    fold,
    foldAll(axis: OutlineAxis, collapsed: boolean) {
      foldBy(collapseAll(seen(), axis, collapsed));
    },
    // Alt+Shift+↑ and ↓ (D161): the active cell's row first, its column first with whole columns selected.
    foldAtActive(collapse: boolean) {
      const sel = c.selectionNow();
      const axes: OutlineAxis[] = wholeLines(sel, c.grid) === 'c' ? ['c', 'r'] : ['r', 'c'];
      for (const axis of axes) {
        const at = axis === 'r' ? sel.active.r : sel.active.c;
        const targets = foldTargets(c.viewLayout, axis, at);
        if (collapse && targets.collapse) return fold(axis, targets.collapse, true);
        if (!collapse && targets.expand.length) {
          return foldBy(collapseGroups(seen(), axis, targets.expand, false));
        }
      }
    },
    setControls(axis: OutlineAxis, after: boolean) {
      const w = setControls(c.sheet, axis, after);
      if (w) c.write(w, 'Group');
    },
  };
}
