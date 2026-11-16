// The selection each undo step was made with (docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo"): undo brings
// back the selection a step was made with, and redo the selection undo left behind. Kept by the step's depth in the
// tab history (useDocumentHistory): a new step at a depth replaces whatever an older branch kept there. Pure.

import type { Tab } from '@livedoc/document';
import { EMPTY_SELECTION, sameMembers, selectionIds, type Selection } from './selection-store';

type StepMark = { readonly before: Selection; readonly after?: Selection };

export type StepSelections = Readonly<Record<number, StepMark>>;

// As many steps as the tab history keeps (HISTORY_LIMIT).
const KEPT = 500;

export const StepSelections = {
  empty: (): StepSelections => ({}),

  /** A new step reached `depth`, made while `before` was selected. */
  record: (
    marks: StepSelections,
    depth: number,
    before: Selection,
    kept = KEPT,
  ): StepSelections => {
    const next: Record<number, StepMark> = {};
    for (const [key, mark] of Object.entries(marks)) {
      const at = Number(key);
      if (at > depth - kept && at < depth) next[at] = mark;
    }
    next[depth] = { before };
    return next;
  },

  /** Undo took the step at `depth` back, leaving `after` selected: what its redo brings back. */
  leftByUndo: (marks: StepSelections, depth: number, after: Selection): StepSelections => {
    const mark = marks[depth];
    return mark ? { ...marks, [depth]: { ...mark, after } } : marks;
  },

  forUndo: (marks: StepSelections, depth: number): Selection | null => marks[depth]?.before ?? null,

  forRedo: (marks: StepSelections, depth: number): Selection | null => marks[depth]?.after ?? null,
} as const;

/** `selection`, less what is not on tab `tabId` of `tabs` (gone with the step, or never there). */
export function selectionWithin(
  selection: Selection,
  tabs: readonly Tab[],
  tabId: string,
): Selection {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return EMPTY_SELECTION;
  const present = new Set(tab.elements.map((el) => el.id));
  const kept = [...selectionIds(selection.selectedId, selection.multiSelectedIds)].filter((id) =>
    present.has(id),
  );
  if (kept.length === 0) return EMPTY_SELECTION;
  if (selection.multiSelectedIds.size > 0 && kept.length > 1) {
    return { selectedId: null, multiSelectedIds: new Set(kept) };
  }
  return { selectedId: kept[0]!, multiSelectedIds: new Set() };
}

export function hasSelection(selection: Selection): boolean {
  return selection.selectedId !== null || selection.multiSelectedIds.size > 0;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  return sameMembers(
    selectionIds(a.selectedId, a.multiSelectedIds),
    selectionIds(b.selectedId, b.multiSelectedIds),
  );
}
