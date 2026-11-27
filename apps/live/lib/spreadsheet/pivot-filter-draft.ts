// A pivot table filter's Filter by Condition in the Pivot Table Editor (docs/specs/029-sheets/pivot-tables.md "Pivot
// Table Editor", D622): the sheet filter's condition draft, read from a pivot filter and written back into one. Custom
// formula is the filter by formula over the source's column names; any other condition goes beside the ticked items.
// A date condition is by an exact date: the output reads no day as today.
import type { SheetPivotFilter } from '@livedoc/sheets';
import {
  takesTwo,
  takesValue,
  type ConditionDraft,
} from '@/components/sheets/filter-condition-draft';

/** The draft a filter's condition opens with. */
export function draftOfPivotFilter(filter: SheetPivotFilter): ConditionDraft {
  const blank: ConditionDraft = { op: '', a: '', b: '', d: '', fx: '=' };
  if (filter.formula !== undefined) return { ...blank, op: 'formula', fx: filter.formula };
  const { op, a, b } = filter.cond;
  return { ...blank, op: op ?? '', a: a ?? '', b: b ?? '' };
}

/** The filter a draft writes, its ticked items kept beside a condition; null for an empty Custom formula is. */
export function pivotFilterOfDraft(
  filter: SheetPivotFilter,
  draft: ConditionDraft,
): SheetPivotFilter | null {
  if (draft.op === 'formula') {
    const text = draft.fx.trim().replace(/^=\s*/, '');
    return text === '' ? null : { col: filter.col, formula: `=${text}` };
  }
  const values = filter.formula === undefined ? filter.cond.values : undefined;
  const { op, a, b } = draft;
  const value = takesValue({ ...draft, d: '' });
  return {
    col: filter.col,
    cond: {
      ...(values ? { values } : {}),
      ...(op ? { op } : {}),
      ...(value && a ? { a } : {}),
      ...(value && takesTwo(op) && b ? { b } : {}),
    },
  };
}
