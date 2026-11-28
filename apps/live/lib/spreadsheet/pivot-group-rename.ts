// Renaming a pivot table's custom group by typing over its cell (docs/specs/029-sheets/pivot-tables.md "Grouping in the
// grid", Webber's ruling 2026-11-28): the one output cell that takes typing, an Editor's. Pure.
import {
  pivotRenameCustomGroup,
  type Sheet,
  type SheetPivot,
  type Workbook,
} from '@livedoc/sheets';

export const GROUP_NAME_EMPTY = 'Enter a name for the group';
export const GROUP_NAME_TOO_LONG = "A group's name is up to 200 characters";
export const GROUP_NAME_TAKEN = 'Another group is called that';

/** What typing `typed` over (r, c) does: nothing special (null), a rename (or none for the same name), or a refusal. */
export type GroupRename = { next: SheetPivot | null } | { refused: string };

export function pivotGroupRenameAt(
  wb: Workbook,
  sheet: Sheet,
  r: number,
  c: number,
  typed: string,
): GroupRename | null {
  const at = wb.pivotItemAt(sheet.id, r, c);
  if (!at || at.made !== 'custom' || typeof at.label !== 'string') return null;
  const pivot = sheet.layout.objects?.find(
    (x): x is SheetPivot => x.kind === 'pivot' && x.id === at.pivotId,
  );
  if (!pivot) return null;
  const out = pivotRenameCustomGroup(pivot, at.axis, at.depth, at.label, typed);
  if (out === 'none') return null;
  if (out === 'same') return { next: null };
  if (out === 'empty') return { refused: GROUP_NAME_EMPTY };
  if (out === 'too_long') return { refused: GROUP_NAME_TOO_LONG };
  if (out === 'taken') return { refused: GROUP_NAME_TAKEN };
  return { next: out };
}
