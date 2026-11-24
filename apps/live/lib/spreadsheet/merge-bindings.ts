// Format › Merge Cells and the toolbar's Merge Cells (docs/specs/029-sheets/formatting.md "Merges", D208): Merge All,
// Merge Vertically (one cell of each column), Merge Horizontally (one of each row) and Unmerge, each dimmed where it
// would do nothing; the toolbar's button merges all, or unmerges a selection holding a merge, pressed while it does.
import type { GridRange, MergeMode } from '@livedoc/sheets';
import type { OfficeAction } from '@/lib/office/office-catalogue';

/** What the merge items read and run: the selection, whether it holds a merge, the grid's merge and unmerge. */
export type MergePort = {
  range: GridRange;
  merged: boolean;
  merge: (mode: MergeMode) => void;
  unmerge: () => void;
};

export function mergeBindings({
  range: g,
  merged,
  merge,
  unmerge,
}: MergePort): Record<string, OfficeAction> {
  const oneRow = g.r1 === g.r2;
  const oneColumn = g.c1 === g.c2;
  const oneCell = oneRow && oneColumn;
  return {
    'merge-all': { run: () => merge('all'), disabled: oneCell },
    'merge-vertically': { run: () => merge('down'), disabled: oneRow },
    'merge-horizontally': { run: () => merge('across'), disabled: oneColumn },
    unmerge: { run: unmerge, disabled: !merged },
    'merge-cells': {
      run: () => (merged ? unmerge() : merge('all')),
      checked: merged,
      disabled: oneCell && !merged,
    },
  };
}
