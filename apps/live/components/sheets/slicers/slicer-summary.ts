// What a slicer shows (docs/specs/029-sheets/data-tools.md "Slicers"): its title, else its column's name, and what it
// keeps: `All`, `3 of 5` for values, or the condition's words (`Greater than 2`); "Choose a column" once its column
// is gone and "No data" once its range is (D486). Pure.
import type { FilterCondition } from '@livedoc/sheets';
import { CONDITION_LABELS, PERIOD_LABELS } from '../filter-condition-draft';

export const SLICER_NO_COLUMN = 'Choose a column';
export const SLICER_NO_DATA = 'No data';
export const SLICER_ALL = 'All';

/** The words for what a condition keeps: its condition's, else its values counted against the column's. */
export function slicerKeeps(cond: FilterCondition | null, valueCount: number): string {
  if (!cond) return SLICER_ALL;
  if (cond.op && cond.op !== 'formula') {
    const label = CONDITION_LABELS[cond.op];
    const operand = cond.d
      ? PERIOD_LABELS[cond.d].toLowerCase()
      : [cond.a, cond.b].filter((x) => x !== undefined && x !== '').join(' and ');
    return operand ? `${label} ${operand}` : label;
  }
  if (cond.values) return `${cond.values.length} of ${valueCount}`;
  return SLICER_ALL;
}

/** The slicer's heading: its title, else its column's header text, else the column's letter. */
export function slicerHeading(title: string | undefined, header: string): string {
  return title?.trim() || header;
}
